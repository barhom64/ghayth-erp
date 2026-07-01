-- 457_campaign_broadcast_and_whatsapp_templates.sql
-- إضافة الإرسال الجماعي للحملات + إدارة قوالب واتساب المعتمدة من Meta.
-- يعيد استخدام outbound_queue الموجود (فيه templateName/templateParams أصلاً)
-- ومحرك الإرسال messageSender + عامل الكرون processWhatsAppQueue. جدولان جديدان فقط.
-- @rollback: DROP TABLE IF EXISTS public.campaign_recipients; DROP TABLE IF EXISTS public.whatsapp_templates;

-- قوالب واتساب المعتمدة (تعكس القوالب المسجّلة في Meta WhatsApp Business).
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id                SERIAL PRIMARY KEY,
  "companyId"       integer NOT NULL REFERENCES public.companies(id),
  name              varchar(120) NOT NULL,
  language          varchar(10) NOT NULL DEFAULT 'ar',
  category          varchar(20) NOT NULL DEFAULT 'MARKETING',
  status            varchar(20) NOT NULL DEFAULT 'draft',
  "headerText"      text,
  "bodyText"        text NOT NULL,
  "footerText"      text,
  "variableCount"   integer NOT NULL DEFAULT 0,
  "sampleParams"    jsonb,
  "rejectionReason" text,
  "createdBy"       integer REFERENCES public.users(id),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "deletedAt"       timestamptz,
  CONSTRAINT whatsapp_templates_category_check CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  CONSTRAINT whatsapp_templates_status_check CHECK (status IN ('draft','pending','approved','rejected'))
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_company ON public.whatsapp_templates ("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_template_name
  ON public.whatsapp_templates ("companyId", lower(name), language)
  WHERE "deletedAt" IS NULL;

-- مستلمو الحملة: صف لكل مستلم مُدرَج في الإرسال الجماعي (تتبّع + منع التكرار).
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id                BIGSERIAL PRIMARY KEY,
  "companyId"       integer NOT NULL REFERENCES public.companies(id),
  "campaignId"      integer NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  "clientId"        integer REFERENCES public.clients(id),
  channel           varchar(20) NOT NULL,
  recipient         varchar(300) NOT NULL,
  "recipientName"   varchar(200),
  status            varchar(20) NOT NULL DEFAULT 'queued',
  "outboundQueueId" bigint,
  "messageLogId"    bigint,
  "errorMessage"    text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_recipients_channel_check CHECK (channel IN ('email','sms','whatsapp','push')),
  CONSTRAINT campaign_recipients_status_check CHECK (status IN ('queued','sent','failed','skipped'))
);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON public.campaign_recipients ("campaignId");
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_company ON public.campaign_recipients ("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_recipient
  ON public.campaign_recipients ("campaignId", channel, recipient);
