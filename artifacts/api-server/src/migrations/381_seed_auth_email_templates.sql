-- ===========================================================================
-- 381_seed_auth_email_templates.sql
-- ---------------------------------------------------------------------------
-- WHAT:    seed the account-lifecycle auth templates into the EXISTING
--          notification_templates table (no new table) — Arabic-first,
--          with an English companion line, for every company.
-- WHY:     #2137 slice 2. The account flows (new-user invitation,
--          activation, password reset, password changed) had ZERO
--          templates; the engine fell back to nothing. These four keys
--          are dispatched through sendMessage()/notificationEngine so
--          they land in message_log + outbound_queue like every other
--          message.
--
-- PLACEHOLDERS (documented per key):
--   auth.new_user_invitation.email / auth.account_activation.email:
--       {{userName}}        — recipient display name
--       {{activationUrl}}   — single-use activation link (raw token in URL only)
--       {{expiresHours}}    — link validity window in hours (72)
--   auth.password_reset.email:
--       {{userName}}, {{resetUrl}}, {{expiresMinutes}} (60)
--   auth.password_changed.email:
--       {{userName}}, {{changedAt}}  — security notice, carries NO secret
--
-- SAFETY:  pure idempotent seed (WHERE NOT EXISTS by company+key+channel+
--          language). No secret material — the URLs are interpolated at
--          send time, never stored here. channel email for all; a single
--          in_app companion for the security notice.
-- @rollback:
--   DELETE FROM notification_templates
--    WHERE "templateKey" IN ('auth.new_user_invitation.email',
--      'auth.account_activation.email','auth.password_reset.email',
--      'auth.password_changed.email') AND "isDefault" = true;
-- ===========================================================================

INSERT INTO notification_templates
  ("companyId", "templateKey", channel, language, "titleTemplate", "bodyTemplate", variables, "isActive", "isDefault")
SELECT c.id, t."templateKey", t.channel, t.language, t."titleTemplate", t."bodyTemplate", t.variables::jsonb, true, true
FROM companies c
CROSS JOIN (VALUES
  -- ── New user invitation (set your password) ────────────────────────────
  ('auth.new_user_invitation.email', 'email', 'ar', 'دعوة لتفعيل حسابك في نظام غيث',
   '<p>مرحباً {{userName}}،</p><p>تم إنشاء حساب لك في <strong>نظام غيث</strong>. لتفعيل حسابك وتعيين كلمة المرور، افتح الرابط التالي:</p><p><a href="{{activationUrl}}">تفعيل الحساب وتعيين كلمة المرور</a></p><p>هذا الرابط صالح لمدة {{expiresHours}} ساعة ويُستخدم مرة واحدة. إذا لم تطلب هذا الحساب فتجاهل هذه الرسالة.</p>',
   '["userName","activationUrl","expiresHours"]'),
  ('auth.new_user_invitation.email', 'email', 'en', 'Invitation to activate your Ghayth account',
   '<p>Hello {{userName}},</p><p>An account has been created for you in <strong>Ghayth</strong>. To activate it and set your password, open the link below:</p><p><a href="{{activationUrl}}">Activate account &amp; set password</a></p><p>This link is valid for {{expiresHours}} hours and can be used once. If you did not expect this, ignore this message.</p>',
   '["userName","activationUrl","expiresHours"]'),

  -- ── Account activation (re-send / explicit activation) ─────────────────
  ('auth.account_activation.email', 'email', 'ar', 'تفعيل حسابك في نظام غيث',
   '<p>مرحباً {{userName}}،</p><p>لإكمال تفعيل حسابك في <strong>نظام غيث</strong> وتعيين كلمة المرور، افتح الرابط:</p><p><a href="{{activationUrl}}">تفعيل الحساب</a></p><p>صالح لمدة {{expiresHours}} ساعة، ويُستخدم مرة واحدة.</p>',
   '["userName","activationUrl","expiresHours"]'),
  ('auth.account_activation.email', 'email', 'en', 'Activate your Ghayth account',
   '<p>Hello {{userName}},</p><p>To finish activating your <strong>Ghayth</strong> account and set your password, open:</p><p><a href="{{activationUrl}}">Activate account</a></p><p>Valid for {{expiresHours}} hours, single use.</p>',
   '["userName","activationUrl","expiresHours"]'),

  -- ── Password reset ─────────────────────────────────────────────────────
  ('auth.password_reset.email', 'email', 'ar', 'إعادة تعيين كلمة المرور — نظام غيث',
   '<p>مرحباً {{userName}}،</p><p>وصلنا طلب لإعادة تعيين كلمة مرور حسابك في <strong>نظام غيث</strong>. لتعيين كلمة مرور جديدة افتح الرابط:</p><p><a href="{{resetUrl}}">إعادة تعيين كلمة المرور</a></p><p>هذا الرابط صالح لمدة {{expiresMinutes}} دقيقة ويُستخدم مرة واحدة. إذا لم تطلب ذلك فتجاهل الرسالة — لن تتغيّر كلمة مرورك.</p>',
   '["userName","resetUrl","expiresMinutes"]'),
  ('auth.password_reset.email', 'email', 'en', 'Reset your password — Ghayth',
   '<p>Hello {{userName}},</p><p>We received a request to reset the password for your <strong>Ghayth</strong> account. To set a new password, open:</p><p><a href="{{resetUrl}}">Reset password</a></p><p>This link is valid for {{expiresMinutes}} minutes and can be used once. If you did not request this, ignore it — your password will not change.</p>',
   '["userName","resetUrl","expiresMinutes"]'),

  -- ── Password changed (security notice — no secret) ─────────────────────
  ('auth.password_changed.email', 'email', 'ar', 'تم تغيير كلمة مرور حسابك — نظام غيث',
   '<p>مرحباً {{userName}}،</p><p>نُعلمك أن كلمة مرور حسابك في <strong>نظام غيث</strong> تم تغييرها بتاريخ {{changedAt}}. إذا كنت أنت من قام بذلك فلا حاجة لأي إجراء.</p><p>إن لم تكن أنت، تواصل مع مسؤول النظام فوراً.</p>',
   '["userName","changedAt"]'),
  ('auth.password_changed.email', 'email', 'en', 'Your password was changed — Ghayth',
   '<p>Hello {{userName}},</p><p>This is a notice that the password for your <strong>Ghayth</strong> account was changed on {{changedAt}}. If this was you, no action is needed.</p><p>If it was not you, contact your system administrator immediately.</p>',
   '["userName","changedAt"]'),
  ('auth.password_changed.email', 'in_app', 'ar', 'تم تغيير كلمة مرورك',
   'تم تغيير كلمة مرور حسابك بتاريخ {{changedAt}}. إن لم تكن أنت، تواصل مع المسؤول فوراً.',
   '["userName","changedAt"]'),
  ('auth.password_changed.email', 'in_app', 'en', 'Your password was changed',
   'Your account password was changed on {{changedAt}}. If this was not you, contact your administrator immediately.',
   '["userName","changedAt"]')
) AS t("templateKey", channel, language, "titleTemplate", "bodyTemplate", variables)
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates nt
  WHERE nt."companyId" = c.id
    AND nt."templateKey" = t."templateKey"
    AND nt.channel = t.channel
    AND nt.language = t.language
);
