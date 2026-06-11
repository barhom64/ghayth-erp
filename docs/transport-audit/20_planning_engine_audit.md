# 20 — جرد محرّك تخطيط النقل (Transport Planning Engine Audit)

> ملحق إلزامي ضمن الموجة ج لـ#2079 — يسبق أي بناء جديد للـOptimizer أو تعديل على `assignmentSuggestionEngine.ts`. الاعتماد قرار مالك. لا كود قبل اعتماد الخطة المكتوبة.

- **HEAD المجرود:** `20c19020` (main بعد دمج #2108/#2110/#2112 — الموجة أ كاملة).
- **النطاق:** المحرّك المركزي للإسناد + سطح ops-weekly + قوالب الجدولة + حدود التداخل مع العمرة والصيانة والإجازات والملف الفني.
- **المنهج:** فحص حيّ للملفات المرجعية (`assignmentSuggestionEngine.ts`، `transport-planning.ts`، `transport-bookings.ts`، `vehicleCapacity.ts`، `driverRest.ts`، `cronScheduler.ts`، migrations 262/271/284/295/305/310). كل ادعاء أدناه له ملف:سطر مرئيّ.

---

## §0 — جرد المحاور الفعلية في محرّك الإسناد

`assignmentSuggestionEngine.ts:558-566` يجمع 7 محاور بأوزان ثابتة:

| المحور | الوزن | الحارس الصلب | الحارس الناعم |
|---|---|---|---|
| capacity | 0.20 | `< cargoKg`/`< pax` → 0 وblocker | غياب الحقل → 50 |
| availability | 0.10 | — | `status != 'available'` → 60 |
| conflict | 0.25 | تداخل `tstzrange` على dispatch → 0 | — |
| driver_rest | 0.15 | `hoursSince < restRequired` → 0 | داخل 2 ساعة من الحد → 80 |
| license | 0.10 | — (الصلب في `assertDriverEligibility` عند الـcommit) | mismatch ثقيل → 30 |
| distance | 0.10 | — | منحنى تنازلي 0–200 كم |
| agreement | 0.10 | مطابقة فئة العميل/سياسة الاستبدال | upgrade مسموح → 70 |

**الناتج النهائي:** ترتيب «اقتراحي». الحراس الصلبة الفعلية في الإسناد (`assertDriverEligibility`/`asserCapacity`/conflict overlap) تُعاد عند الـ`POST /dispatch-orders`. **المحرّك مستشار لا سلطة** — هذا التصميم صحيح ولا ينبغي قلبه.

**ما ليس في المحرّك إطلاقًا:**
- لا قراءة لـ`validForPassengers/validForCargo` (مهاجر منذ 295).
- لا قراءة لـ`operationalPayloadKg` — المقارنة دائمًا مقابل `payloadKg` (السقف الإسمي).
- لا قراءة لـ`fleet_maintenance` المجدولة في نافذة الحجز.
- لا قراءة لإجازات/غياب السائق سوى `status='on_leave'` (لا تقاطع زمني مع `driver_leave_requests` المعتمدة).
- لا تكامل مع `transport_route_patterns` / `transport_itineraries` (الـlegs المجاورة لا تُؤخذ في الحسبان عند ترتيب اللحظة التالية).
- لا قياس استخدام مركبة سابق («predictedUtilisation» مُعلَن في الـinterface سطر 81 ولا يُحسب أبدًا).

---

## §1 — استغلال الأسطول (Fleet Utilization)

**ما يوجد فعلًا:**
- `transport-planning.ts:355-389` — سطح `ops-weekly` يحسب `bookedMinutes / (7×24×3600)` لكل مركبة على نافذة 7 أيام، يرتّب تنازليًا.
- التغطية: سطح تشغيلي للمشغّل فقط؛ **لا يدخل المحرّك** كمحور ترجيح.
- `SuggestionResult.predictedUtilisation` معلن في `assignmentSuggestionEngine.ts:79-82` ولا يُحسب.

**الفجوات:**
1. **UTIL-01 — المحرّك أعمى عن الاستخدام السابق:** يُرشّح مركبة مكتملة الاستخدام (>90% أسبوعيًا) بنفس درجة مركبة ساكنة (<10%). يقود إلى استنزاف غير متوازن، إجهاد، صيانة مبكّرة، وراحة سائق ضائعة.
2. **UTIL-02 — مقام «7×24×3600» تجاري مُضلِّل:** يحتسب 24/7 وكأن الأسطول يعمل ليلًا/جمعة. الأنسب: نوافذ تشغيل لكل branch (متى يفتح/يغلق) + عطلات معروفة.
3. **UTIL-03 — لا أثر للوحدة المختلطة:** مركبة `validForPassengers AND validForCargo` تُحتسب كمستهلَكة بكامل دقائقها بصرف النظر عن نوع الرحلة.

**التوصية:**
- **محور جديد `utilization` (وزن 0.05 خصم من distance → 0.05):** قراءة دقائق محجوزة آخر 7 أيام من نفس استعلام ops-weekly، خصم نقاط للمتجاوزين 80%، إضافة نقاط للمتأخرين عن 30%. لا حارس صلب. **نمط نسخ-وألصق من ops-weekly، لا engine جديد.**
- **استبدال `predictedUtilisation` بحساب فعلي** = (وقت الحجز الحالي + بقية الأسبوع المحجوز) / نافذة تشغيل الفرع. تُحفظ على `SuggestionResult` ليعرضها المشغّل.
- **مقام `bookedMinutes` يحترم branch operating hours:** قراءة من `branches.workSchedule` إن وُجد، وإلا fallback لـ12×6 (10:00–22:00 سبت–خميس). يُدخَل كـsettings خادمية لا hard-coded.

**ليس Optimizer:** هذا ضبط محور ثامن في المحرّك القائم. الـbackhaul/multi-pickup batch optimizer يبقى P1 منفصلًا.

---

## §2 — النقل متعدد المقاطع (Multi-leg)

**ما يوجد فعلًا:**
- `transport_itineraries` + `transport_itinerary_legs` (migration 271:213-287) — نموذج كامل: leg sequence، نوافذ، فئة مطلوبة لكل leg، dispatchOrderId، أنواع legs (transit/pickup/dropoff/rest/fuel/inspection/custom).
- `suggestForLeg` في `assignmentSuggestionEngine.ts:250-306` يقترح لكل leg مستقلًّا، **لكنه يتعامل مع كل leg كأنه booking مستقل**.
- لا توجد آلية لإسناد itinerary كاملة لـ(vehicle، driver) واحد ما لم يضغط المشغّل «اقترح» لكل leg ويختار يدويًا نفس الثنائي.

**الفجوات:**
1. **MULTI-01 — اقتراحات legs غير متّسقة:** الـleg 2 تفترض المركبة في موقع origin النصّي للـleg، بينما هي فعلًا في موقع نهاية الـleg 1 (إن أُسند نفس الثنائي). نتيجة: درجة distance خاطئة، وأحيانًا يُرشَّح ثنائي يكسر السلسلة لأنه «أقرب جغرافيًا» للـleg مستقلًّا.
2. **MULTI-02 — لا حارس تسلسل زمني:** المحرّك لا يكتشف إذا كان `legs[i].scheduledEnd > legs[i+1].scheduledStart` (تداخل ذاتي داخل الـitinerary نفسها) — يفلت إلى الـdispatch ثم يُكتشف هناك متأخّرًا.
3. **MULTI-03 — لا اقتراح «itinerary كاملة»:** المشغّل يكرّر العملية N مرة لـN legs؛ لا يوجد `POST /transport/itineraries/:id/suggest` يرجع مصفوفة `[{legId, candidates}]` بترتيب يحترم السلسلة.
4. **MULTI-04 — `assignedVehicleId/DriverId` على الـleg لا يبني dispatchOrder تلقائيًا:** الـmigration 271:262-263 يُسجّل الإسناد ولكن إنشاء الدفعة (legs → bookings → dispatch) ليس مكشوفًا. حالة meta: «مُسنَد قبل وجود dispatch» قد تخلق سوء فهم في ops-dashboard.

**التوصية:**
- **`POST /transport/itineraries/:id/suggest` جديد:** يدور على legs بالترتيب، يمرّر `lastKnownLocation` بين legs (= destination الـleg السابق)، يرجّح بقاء الثنائي نفسه على كامل السلسلة بـ`continuity` bonus (نقاط +10 إذا اقتُرح نفس (vehicleId, driverId) في الـleg السابق). **محسوب طبقة فوق `suggestForCriteria` لا داخله.**
- **حارس تسلسل ذاتي في `transport-planning.ts` قبل قبول legs:** إذا تداخلت legs زمنيًا، رفض الحفظ. خطأ Arabic واضح: «المرحلة (n+1) تبدأ قبل انتهاء المرحلة n».
- **مادlisation قياسي للـitinerary:** زر «جسِّد الجدولة» يُنشئ N bookings (واحد لكل leg غير-rest/fuel/inspection) + dispatch orders بآلية idempotent على (itineraryId, legNumber). لا يحلّ محل الـmaterialise القائم للقوالب — منفصل.

**ليس Optimizer:** هذا إكمال نموذج موجود. الـRoute Optimization (TSP, VRP, time-windows) يبقى P1 منفصلًا — يحتاج OR-Tools أو مزوّد خارجي.

---

## §3 — تكامل العمرة (Umrah)

**ما يوجد فعلًا:**
- `transport_bookings.umrahGroupId` (FK لـ`umrah_groups`)، مع source = `umrah_group` (`transport-bookings.ts:60, 167, 553`).
- `transport_itineraries.umrahGroupId` (migration 271:219).
- `CapacitySource = 'umrah_transport'` (`vehicleCapacity.ts:33`) و`EligibilitySource` المماثل (`driverEligibility.ts:40`) — البنية موجودة.
- `transport-bookings.ts:440-450` — `extractRelatedEntity` يقرأ الـgroup ويعيده للسطر.

**الفجوات:**
1. **UMR-01 — لا تخصيص للسائق المُجرَّب لمجموعة:** المحرّك لا يميّز السائق الذي أكمل ≥N رحلات لنفس الـ`umrahGroupId` (أو لـcustomer العمرة) في آخر 90 يومًا. كل عمليات «المرشد المتمرس على فوج الأردن» لا تظهر للمشغّل.
2. **UMR-02 — لا حارس fixed مع مواعيد الطيران/الحجز:** `flightNumber` و`supervisorPhone` يُسجَّلان (`transport-bookings.ts:553-557`) ولا يُربطان بأي محرّك. التأخّر على رحلة طيران لا يُعيد ترتيب الـitinerary تلقائيًا.
3. **UMR-03 — `umrah_groups.programStartsAt/EndsAt` (إن وُجدا) لا يُقصيان مركبات/سائقين خارج النافذة:** إسناد مركبة في يوم لا يتقاطع مع برنامج الفوج ممكن (يُرفض لاحقًا في القبول البشري لا في المحرّك).
4. **UMR-04 — لا lineage في النتائج:** الـ`SuggestionResult` لا يُفرّق رحلة-عمرة عن رحلة عامّة في الـreasons؛ المشغّل لا يرى «هذا الثنائي خدم نفس الفوج 4 مرات».

**التوصية:**
- **محور `umrahFamiliarity` (وزن 0.05 جديد، مأخوذ من distance 0.10→0.05):** يُفعَّل فقط إذا `transportServiceType = 'passenger_umrah'`. يقرأ COUNT من `transport_dispatch_orders` (Status completed، آخر 90 يومًا، نفس `umrahGroupId` أو نفس `b.customerId` العمرة). ≥3 رحلات → +15؛ ≥1 → +8.
- **حارس «داخل برنامج الفوج»:** عند إنشاء الـbooking مع `umrahGroupId`، رفض إذا `pickupWindowStart` خارج `[group.programStartsAt - 1d, group.programEndsAt + 1d]`. يكفي حارس زمني، لا يلمس المحرّك.
- **lineage في الـreasons:** عند `umrahFamiliarity ≥ 8`، إضافة سطر «هذا السائق خدم الفوج N مرات سابقًا» — يفيد المشغّل.

**شرط:** هذه التغييرات تفترض أن `umrah_groups` فعلًا تحمل `programStartsAt/EndsAt` — يحتاج تأكيدًا من ملف 09 أو فحص schema. **CHECK-PE-01.**

---

## §4 — الملف الفني للمركبة (Vehicle Technical Profile)

**ما يوجد فعلًا (migration 262 + 295):**

19 حقلًا فنيًا على `fleet_vehicles`:
- شحن: `payloadKg`, `operationalPayloadKg` (آمن تشغيليًا), `boxLengthCm/WidthCm/HeightCm`, `axleCount`, `tireCount`, `tireSize`.
- محرّك: `engineDisplacementCc`, `transmissionType`.
- ركاب: `seatCount`, `hasAc`, `screenCount`, `doorCount`, `upholsteryType`, `safetyFeatures` (jsonb).
- معدّات: `operatingHours`, `equipmentAttachments` (jsonb).
- صلاحيّة: `validForPassengers`, `validForCargo` (migration 295).

**ما يقرأه المحرّك فعلًا:** `payloadKg`, `seatCount`, `vehicleType` فقط (`assignmentSuggestionEngine.ts:331-347, 412-444, 482-498`).

**الفجوات الحادّة:**
1. **PROF-01 — `operationalPayloadKg` مُخزَّن ومُهمَل:** المقارنة في `assignmentSuggestionEngine.ts:415-430` تستخدم `payloadKg` فقط. السقف الإسمي للمركبة يقبل حمولة قانونية على الأوراق لكنها غير آمنة على الطريق. **خطر تشغيلي مباشر.**
2. **PROF-02 — `validForPassengers/validForCargo` معطّلتان في المحرّك:** يمكن اقتراح ترَيلر cargo-only لـ`passenger_umrah` (حتى الـ100 درجة) — يفلت إلى guard الأهلية فقط إن جرى الـcommit. الأصحّ: إقصاء فوريّ.
3. **PROF-03 — أبعاد الصندوق لا تشارك في الترشيح:** حجز يطلب «حمولة 3×1.2×1.5م» لا يوجد طريق له ليُقارَن مع `boxLengthCm/WidthCm/HeightCm`. (حقول الحجم على `transport_bookings` تحتاج تأكيدًا — **CHECK-PE-02**.)
4. **PROF-04 — `safetyFeatures` و`hasAc` للركاب لا أثر لها في المحرّك:** عميل يطلب «حافلة بمكيّف فعّال» لا فلتر له. حقل العميل المعادل لا يبدو موجودًا — **CHECK-PE-03**.

**التوصية:**
- **عاجل (حارس صلب):** قبل دخول حلقة الـscoring في `assignmentSuggestionEngine.ts:398`، رفض المركبة إذا `tripFamily='cargo' AND validForCargo=false` أو `tripFamily='passenger' AND validForPassengers=false`. صفر سطر إضافي على نتائج. لا «درجة 30» — إقصاء.
- **عاجل (تفضيل آمن):** في `capacityScore`، استخدم `operationalPayloadKg ?? payloadKg`. إذا الـحمولة المطلوبة > `operationalPayloadKg` لكنها ≤ `payloadKg`، خصم درجة (60) + reason: «الحمولة ضمن السقف القانوني لكنها تتجاوز الحمولة التشغيلية الآمنة». لا blocker (يمرّ بـoverride موثق إن لزم).
- **CHECK-PE-02/03:** يتطلب توثيق ما يصل من الحجز حول الأبعاد/مزايا الراحة قبل توسيع المحرّك. **لا تنفّذ بنفس PR التوصيتين الأوليين.**

**فائدة جانبية:** هذه أكبر دفعة قيمة بأقل سطور — حارسان قبل الحلقة كافيان لإغلاق فجوة آمان شاهقة.

---

## §5 — راحة السائق (Driver Rest)

**ما يوجد فعلًا:**
- `restHoursRequired`, `lastDutyEndedAt` على `fleet_drivers` (migration 271:103-106).
- محور driver_rest في `assignmentSuggestionEngine.ts:463-479` — حارس صلب إن لم تُستوفَ ساعات الراحة منذ آخر إنهاء.
- ختم `lastDutyEndedAt`:
  - من إنهاء جلسة الملاحة (`transport-planning.ts:943-952`).
  - من تكميل dispatch direct (`transport-bookings.ts:1010-1024`).
  - **بعد TA-T18-03**: المختبر يُغطّي مسارَي «navigation/complete» و«direct complete».

**الفجوات:**
1. **REST-01 — لا حدّ يومي ولا أسبوعي:** `restHoursRequired` نقطة-بنقطة (هذه الرحلة بعد تلك). لا حارس على «أكثر من 13 ساعة قيادة في يوم» أو «أكثر من 60 ساعة قيادة في الأسبوع» (السقوف العادية في صناعة النقل).
2. **REST-02 — `driver_leave_requests` ليست تقاطعًا زمنيًا:** المحرّك يفحص `status='on_leave'` فقط (سطر 464). إجازة معتمدة في الأسبوع القادم بـ`startsAt/endsAt` لا تقصي السائق من رحلة في تلك النافذة. **CHECK-PE-04** (وجود الجدول وحقوله).
3. **REST-03 — لا أمن رحلة طويلة:** رحلة 14 ساعة (الرياض-جدة بدون توقف) تُسند لسائق وحيد بدون رفع علم؛ المحرّك لا يحسب مدة الرحلة من scheduledStartAt/EndAt مقابل سقف القيادة المتواصلة (مثلًا 4.5 ساعة بحسب لائحة هيئة النقل).
4. **REST-04 — `lastDutyEndedAt` يُختم في النهاية فقط:** أثناء الرحلة، رحلات أخرى تُقترَح للسائق بناءً على آخر إنهاء قديم (لأن الحالي لم ينتهِ بعد). الأنسب: حارس conflict overlap (موجود ✅) + سقف «لا تبدأ رحلة جديدة قبل إنهاء الحالية» (موجود ضمنيًّا في conflict أيضًا ✅) — هذه ليست فجوة، فقط تأكيد.

**التوصية:**
- **حارس يومي/أسبوعي بسيط:** قبل اعتماد المرشح، استعلام واحد لـSUM دقائق آخر 24h و7d. تجاوز السقف → blocker. السقوف من `transport_planning_settings` (افتراض 13h يوميًا، 60h أسبوعيًا، قابل للتعديل). تشريع المالك حصرًا — **CHECK-PE-05**.
- **حارس تقاطع الإجازات (إذا تحقّق CHECK-PE-04):** قراءة `driver_leave_requests` المعتمَدة وتقاطع `tstzrange` مع نافذة الحجز. blocker.
- **علم رحلة-طويلة:** إذا `scheduledEndAt - scheduledStartAt > 6h`، إضافة reason صفراء «الرحلة تتجاوز 6 ساعات — تأكَّد من توفر سائق احتياطي أو توقف راحة مجدول». لا blocker، تنبيه عاطفي.

**ليس Optimizer:** كلها استعلامات بسيطة و3 سطور إضافية في الحلقة.

---

## §6 — الترقية التلقائية للمركبة (Auto-upgrade)

**ما يوجد فعلًا:**
- `UPGRADE_LADDER` ثابت في `assignmentSuggestionEngine.ts:170-175` — 13 درجة من `compact` صعودًا إلى `trailer`.
- `isUpgrade(from, to)` (سطر 181) — منطقي ولكنه يخلط ركاب وحمولة على نفس السلّم (van قبل bus_22، truck فوق bus_50). الـladder غير متجانس عائليًّا.
- سياسة الاستبدال على الحجز: `vehicleSubstitutionPolicy ∈ {exact_only, same_class_only, equivalent_allowed, upgrade_allowed}` + `allowUpgrade` boolean (`transport-bookings.ts:186`).
- منطق agreement (سطر 530-555): إذا الترقية مسموحة → 70 نقطة، وإلا 20 + blocker.

**الفجوات:**
1. **UPG-01 — ladder مختلط cargo+passenger:** «ترقية» van→bus_22 لا معنى لها لرحلة شحن. الـladder يحتاج فرعين: `PAX_LADDER = ['compact','sedan','suv','van','minivan','bus_22','bus_29','bus_45','bus_50']` و`CARGO_LADDER = ['pickup','truck_3.5t','truck_8t','truck_18t','trailer']`. تختار العائلة بحسب `tripFamily`.
2. **UPG-02 — لا سقف تكلفة:** ترقية sedan→suv مقبولة مجانًا في المحرّك. واقعيًا، الترقية تُسجَّل كـ«تنازُل» بسعر العميل القديم لكن المركبة الأعلى. لا حساب لتأثير الترقية على الاستهلاك (وقود/بلى) في الترجيح.
3. **UPG-03 — لا تذكير «الفئة المطلوبة كافية لكنها أوفر»:** إذا فئة المطلوب متاحة بنفس الدرجة والترقية ليست ضرورية، لا تنبيه يدفع المشغّل للتمسّك بالأصل. حاليًّا: ترقية تُختار بـ70 وأصلية تُختار بـ100 → لا مشكلة فعليًّا، فقط لا قيمة مضافة من سرد «هذه ترقية مفيدة لأن…».
4. **UPG-04 — `same_class_only` لا تستفيد من CLASS_EQUIVALENCES:** سياسة «نفس الفئة فقط» تمنع `sedan↔compact` بينما هما مكافئتان (`assignmentSuggestionEngine.ts:157-167` و539-540). تحتاج تأكيد القرار: هل `same_class_only` تعني «تطابق حرفي» أم «مكافئ»؟ القرار الحالي **حرفي + مكافئ**، السطر 535 يدمج `same_class_only` ضمن مكافئ. **CHECK-PE-06.**

**التوصية:**
- **عاجل (UPG-01):** فصل الـladder إلى ladder-per-family واختيار الـladder بناءً على `tripFamily`. تأمين عدم اقتراح ترقية تتجاوز العائلة. اختبار unit بسيط.
- **CHECK-PE-06:** قرار مالك على معنى `same_class_only`. التوصية: **تطابق حرفي صارم** — أعد سلوك سطر 535 ليُقصي المكافئ تحت هذه السياسة.
- **مؤجَّل:** سقف التكلفة (UPG-02) — يحتاج ربط بقاعدة أسعار الترقيات (لا يوجد).

---

## §7 — منع التعارضات التشغيلية (Conflict Prevention)

**ما يوجد فعلًا:**
- conflict overlap على dispatch — `assignmentSuggestionEngine.ts:376-384` — قوي، يستخدم `tstzrange && tstzrange`. ✅
- bulk planning في `transport-planning.ts` يدمج dedupe داخل الدفعة (الملف 07 §4).
- reschedule يعيد فحص التعارض.

**الفجوات:**
1. **CONF-01 — لا تقاطع مع `fleet_maintenance` المجدولة:** صيانة محجوزة لمركبة (موجودة كجدول، migration 269) لا يُفحَص تقاطعها مع نافذة الحجز. المحرّك يُسند مركبة ستكون في الورشة.
2. **CONF-02 — لا تقاطع مع `driver_leave_requests` (مكرّر REST-02).**
3. **CONF-03 — لا حماية من تجاوز نطاق الـbranch:** booking لـbranch X يمكن أن يستخدم مركبة `branchId=Y` بلا فلتر. التصميم الحالي معتمد على `companyId` فقط في الـSELECT (سطر 344). إذا كان المالك يريد عزل الموارد بين الفروع تشغيليًّا — **CHECK-PE-07** (هل الفروع تشارك الأسطول؟).
4. **CONF-04 — لا تقاطع مع رحلات itinerary غير-dispatch:** legs مُسنَدة لكنها لم تُجسَّد بعد كـdispatch (`assignedVehicleId` على الـleg، migration 271:262) لا يلتقطها conflict probe. الـleg المسنَدة لـsuvA يوم الإثنين 8-12 لا تمنع اقتراح suvA لـbooking في نفس النافذة.
5. **CONF-05 — لا فلترة `insuranceExpiry/registrationExpiry`:** مركبة منتهية الترخيص تُقترح. حقول الانتهاء موجودة (migration 083) ولا تُقرأ في المحرّك.
6. **CONF-06 — `vehicle_capacity_overrides` لا تُذكَر:** سجلّ الإسناد-فوق-السقف موجود (migration 262:92-108) ولا يُعرَض على المشغّل عند اقتراح نفس المركبة مرة أخرى لحمل قريب من نفس السقف.

**التوصية:**
- **عاجل (CONF-01):** استعلام `fleet_maintenance` المجدولة (status `scheduled`/`in_progress`) في نفس الـtstzrange. blocker على المركبة. سطر واحد إضافي في conflict probe.
- **عاجل (CONF-05):** قبل دخول الحلقة، إقصاء مركبة لها `registrationExpiry < scheduledEndAt::date` أو `insuranceExpiry < scheduledEndAt::date`. blocker واضح.
- **CONF-04:** توسيع conflict probe ليشمل `transport_itinerary_legs` ذات `assignedVehicleId IS NOT NULL AND scheduledStart/End NOT NULL AND dispatchOrderId IS NULL`. blocker متطابق مع dispatch overlap.
- **CONF-02:** كما §5.
- **CONF-03/07:** قرار مالك. التوصية الافتراضية: **لا فلتر `branchId`** (شركة واحدة، أسطول مشترك)، مع `branchId` كـtie-breaker (تفضيل مركبة الـbranch).
- **CONF-06:** عرض سجل آخر override للمركبة في الـreasons («تم تجاوز سعة هذه المركبة قبل 3 أيام بتفويض موثق»). لا blocker.

---

## §8 — خرائط القرار قبل أي كود

| الرمز | السؤال | الافتراضي المقترَح | الأثر إذا قُلب |
|---|---|---|---|
| CHECK-PE-01 | `umrah_groups.programStartsAt/EndsAt` موجودان؟ | فحص schema قبل تنفيذ UMR | يلغى حارس «داخل برنامج الفوج» |
| CHECK-PE-02 | حقول حجم الحمولة على `transport_bookings`؟ | لا يوجد — تأجَّل PROF-03 | تأجيل توسيع الـmatching الفيزيائي |
| CHECK-PE-03 | حقول تفضيل العميل (AC, safety)؟ | لا يوجد — تأجَّل PROF-04 | تأجيل توسيع agreement |
| CHECK-PE-04 | `driver_leave_requests` موجود؟ | تأكيد + فحص | يلغى REST-02 |
| CHECK-PE-05 | سقوف القيادة اليومية/الأسبوعية؟ | 13h/60h من `transport_planning_settings` | تعديل أرقام |
| CHECK-PE-06 | `same_class_only` تعني حرفي أم مكافئ؟ | حرفي صارم | تعديل سطر 535 |
| CHECK-PE-07 | الفروع تتشارك الأسطول؟ | نعم — branch tie-breaker فقط | إضافة فلتر `branchId` ولا blocker |

---

## §9 — المهام المقترحة (بصيغة #2079 §9 — تُضاف إلى الملف 18)

### TA-T18-PE-01 — حارسا الصلاحية وحدّ الحمولة الآمنة (PROF-01 + PROF-02)
**الوصف:** المحرّك يقترح مركبات ركاب لحمل cargo والعكس، ويتجاهل `operationalPayloadKg`. **الموقع:** `assignmentSuggestionEngine.ts:398` (قبل حلقة المركبات) + `assignmentSuggestionEngine.ts:415-430` (capacityScore). **المطلوب:** (أ) إقصاء `tripFamily='cargo' AND validForCargo=false` أو passenger مع `validForPassengers=false`. (ب) المقارنة في capacity تستخدم `operationalPayloadKg ?? payloadKg`؛ تجاوز الـoperational ضمن الـnominal → درجة 60 + reason، تجاوز الـnominal → 0 + blocker. **الممنوع:** أي تعديل على الـguards الصلبة عند الـcommit (`assertCapacity`)، أي تعديل على الحقول. **معيار القبول:** اختبارات: (1) ترَيلر `validForCargo=true, validForPassengers=false` لا يظهر لحجز `passenger_umrah`. (2) شاحنة `payloadKg=5000, operationalPayloadKg=4000` تحصل على درجة 60 لحمل 4500 ولا تحصل على blocker. **الأولوية:** عاجل جدًا. **الخطورة:** عالية (سلامة). **الارتباط:** الملف 05 + 04.

### TA-T18-PE-02 — حارس صيانة + حارس انتهاء التراخيص (CONF-01 + CONF-05)
**الوصف:** المحرّك يُسند مركبات في الورشة أو منتهية التأمين/الترخيص. **الموقع:** `assignmentSuggestionEngine.ts:376-386` + ما قبل حلقة المركبات. **المطلوب:** (أ) توسيع conflict probe ليشمل `fleet_maintenance` (status `scheduled`/`in_progress` بنافذة `scheduledStartAt/EndAt`) → blocker. (ب) قبل الحلقة، إقصاء مركبة لها `registrationExpiry < scheduledEndAt::date` أو `insuranceExpiry < scheduledEndAt::date`. **معيار القبول:** اختباران: (1) مركبة بصيانة مجدولة مساء الإثنين لا تُقترح لرحلة الاثنين 18:00. (2) مركبة `insuranceExpiry='2026-06-10'` لا تُقترح لرحلة 2026-06-12. **الأولوية:** عاجل. **الخطورة:** عالية. **الارتباط:** صيانة + ملف المركبة.

### TA-T18-PE-03 — تقاطع الإجازات + سقوف القيادة (REST-01 + REST-02)
**الوصف:** السائق في إجازة معتمدة الأسبوع القادم يُقترح، ولا حارس على «13 ساعة في اليوم». **المطلوب:** (أ) قراءة `driver_leave_requests` المعتمَدة (مشروط بـCHECK-PE-04) وإقصاء بـoverlap → blocker. (ب) قراءة سقوف من `transport_planning_settings` (افتراضات 13h/60h)، استعلام SUM لدقائق آخر 24h/7d، تجاوز → blocker بلون مختلف عن conflict. **الممنوع:** بناء الحقول إن لم تكن موجودة — يفتح ticket migration منفصلًا أولًا. **معيار القبول:** اختبار يضع سائقًا على 12 ساعة سابقة في يوم ويقترحه لرحلة 2 ساعات → blocker «تجاوز السقف اليومي». **الأولوية:** عاجل. **الخطورة:** عالية. **الارتباط:** السائقون + الإجازات (HR).

### TA-T18-PE-04 — محور utilization + branch operating hours (UTIL-01 + UTIL-02)
**الوصف:** المحرّك أعمى عن استخدام المركبة السابق. **الموقع:** `assignmentSuggestionEngine.ts:557-566` + استعلام جديد قبل الحلقة. **المطلوب:** إضافة محور `utilization` بوزن 0.05 (نُقَل من `distance` لتبقى الأوزان مجموعها 1.0). قراءة `bookedMinutes` آخر 7 أيام لكل مركبة، نقطة 100 إذا 30–60%، 70 إذا 60–80% أو 10–30%، 40 إذا >80%، 50 إذا <10%. حساب `predictedUtilisation` فعلًا (يحلّ مكان السطر 81-82 الفارغ). **معيار القبول:** اختبار: مركبتان بنفس درجة في كل المحاور، الأقل استخدامًا تظهر أولًا. `predictedUtilisation` يرجع رقمًا، لا undefined. **الأولوية:** مهم. **الخطورة:** متوسطة. **الارتباط:** ops-weekly.

### TA-T18-PE-05 — اقتراح itinerary كاملة + حارس تسلسل ذاتي (MULTI-01 + MULTI-02 + MULTI-03)
**الوصف:** `suggestForLeg` يعامل كل leg كحجز مستقل ويفقد سياق السلسلة. **الموقع:** `assignmentSuggestionEngine.ts:250-306` + `transport-planning.ts` (نقطة legs CRUD). **المطلوب:** (أ) `POST /transport/itineraries/:id/suggest` جديد يدور legs بالترتيب ويمرّر آخر موقع، مع `continuity` bonus +10 إذا الثنائي تم اقتراحه للـleg السابق. (ب) حارس تسلسل قبل قبول leg جديد/تحديثها: رفض overlap داخلي بخطأ Arabic. **الممنوع:** كسر `suggestForLeg` (يبقى للاستخدام المستقل). **معيار القبول:** اختباران: (1) itinerary بـ3 legs تعطي ترتيبًا حيث نفس (vehicleId,driverId) في أعلى 1 لكل leg إن كان متاحًا. (2) leg2 يبدأ قبل نهاية leg1 → 422 + رسالة عربية. **الأولوية:** مهم. **الخطورة:** متوسطة. **الارتباط:** التخطيط متعدد المقاطع.

### TA-T18-PE-06 — تكامل العمرة في الإسناد (UMR-01 + UMR-03 + UMR-04)
**الوصف:** السائق المتمرّس على فوج بعينه لا يُكافأ في المحرّك. **الموقع:** `assignmentSuggestionEngine.ts` + booking guard. **المطلوب:** محور `umrahFamiliarity` بوزن 0.05 (مأخوذ من distance بعد PE-04: distance 0.05 → 0.025، utilization 0.05، umrah 0.025)؛ يُفعَّل فقط لـ`passenger_umrah`. حارس «داخل برنامج الفوج» (مشروط بـCHECK-PE-01). lineage في الـreasons. **الممنوع:** أي تأثير على رحلات غير-عمرة. **معيار القبول:** سائق أكمل 4 رحلات لفوج X يظهر فوق سائق أكمل 0 لنفس الفوج، بفارق ≥ 1 نقطة في الـscore النهائي. **الأولوية:** مهم. **الخطورة:** متوسطة. **الارتباط:** العمرة + السائقون.

### TA-T18-PE-07 — فصل ladder الترقية (UPG-01)
**الوصف:** ladder مختلط passenger+cargo يُتيح ترقيات بلا معنى. **الموقع:** `assignmentSuggestionEngine.ts:170-185`. **المطلوب:** ladder per-family، اختيار بناءً على `tripFamily` (يُمرَّر من `suggestForCriteria`). cleanup CLASS_EQUIVALENCES تماشيًا. **معيار القبول:** اختبار: ترقية «van → bus_22» مرفوضة لـ`tripFamily='cargo'`. **الأولوية:** متوسط. **الخطورة:** منخفضة. **الارتباط:** سياسة الاستبدال.

### TA-T18-PE-CHECKS — حسم نقاط CHECK-PE-01..07
لا PR كود — قرار مالك على 7 نقاط (الجدول §8). مخرج: ملاحظة قرار في #2079 §11 + تحديث هذا الملف.

---

## §10 — ما **ليس** ضمن هذا الجرد (ولماذا)

- **Fleet Optimizer batch-mode (VRP/TSP، route optimization، backhaul):** يبقى P1 خارج الموجة ج. هذا الجرد يضبط المحرّك الاقتراحي **الحالي** نقطة-بنقطة. الـbatch optimizer يحتاج OR-Tools أو مزوّد + قرار مالك على التكلفة + تجربة pilot. **لا نخلط الاثنين.**
- **Driver Reputation Scoring (0.4·onTime + 0.4·completion + 0.2·startRate + specialty multipliers):** سعادة طلبه سابقًا. يبقى مهمة منفصلة (TA-T18-DR) بعد إكمال PE-01..07 — كلاهما يلامس نفس المحرّك ودمجهما في PR واحد سيكون كبيرًا جدًا.
- **التقويم الموحَّد التفاعلي (TR-022):** P1 — سطح UI، لا محرّك.
- **مراقبة حصة الخرائط (TA-GAP-09):** بعد مفتاح Google التجاري (قرار مالك).

---

## §11 — التزام الإغلاق

هذا الملف **ليس Refactor** ولا يفتح أي PR كود من نفسه. الترتيب الإلزامي:
1. **اعتماد المالك** لهذا الملف و7 نقاط CHECK-PE-01..07.
2. **تحديث الملف 18** بإضافة TA-T18-PE-01..07 إلى §«الموجة ج» تحت رمزها.
3. **تنفيذ TA-T18-PE-01 و-02 و-03 أولًا** — أعلى قيمة سلامة وأقل كود.
4. **بقية PE تأتي بالتسلسل** — PR صغير لكل مهمة، فرع مستقل من main المحدَّث، guard أخضر.
5. **لا يُغلَق #2079** حتى تكتمل PE-01..07 + الموجة ب الحيّة + بقية الموجة ج.
