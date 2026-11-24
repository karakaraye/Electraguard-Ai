"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "../../../../lib/api/client";
import { useT } from "../../../../lib/i18n/client";
import { SignInView, type SignInStep } from "../_views/SignInView";

function SignInContainer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();

  const inviteToken = searchParams.get("invite") || searchParams.get("token");

  const [step, setStep] = useState<SignInStep>(inviteToken ? "invite" : "credentials");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrolData, setEnrolData] = useState<{ secret: string; otpauth_uri: string } | null>(null);

  const handleSubmitCredentials = async (emailInput: string, passwordInput: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api("AUTH-04", {
        body: { email: emailInput, password: passwordInput },
      });

      if (!res.ok) {
        if (res.status === 404) {
          setError(t("staff.endpointNotReady"));
        } else if (res.status === 401 || (res.error && res.error.code === "invalid_credentials")) {
          setError(t("s01.errors.invalidCredentials"));
        } else if (res.status === 423 || (res.error && res.error.code === "account_locked")) {
          setError(t("s01.errors.accountLocked"));
        } else {
          setError(res.error?.message || t("staff.networkError"));
        }
        return;
      }

      if (res.data.status === "totp_required") {
        setStep("totp");
      } else if (res.data.status === "totp_enrolment_required") {
        await startTotpEnrolment();
      }
    } catch {
      setError(t("staff.networkError"));
    } finally {
      setLoading(false);
    }
  };

  const startTotpEnrolment = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api("AUTH-05.enrol_start", { body: {} });
      if (res.ok) {
        setEnrolData({ secret: res.data.secret, otpauth_uri: res.data.otpauth_uri });
        setStep("enrol");
      } else {
        if (res.status === 404) {
          setError(t("staff.endpointNotReady"));
        } else {
          setError(res.error?.message || t("staff.networkError"));
        }
      }
    } catch {
      setError(t("staff.networkError"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitTotp = async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api("AUTH-05.verify", {
        body: { code },
      });

      if (!res.ok) {
        if (res.status === 404) {
          setError(t("staff.endpointNotReady"));
        } else if (res.status === 401 || (res.error && res.error.code === "totp_invalid")) {
          setError(t("s01.errors.totpInvalid"));
        } else {
          setError(res.error?.message || t("staff.networkError"));
        }
        return;
      }

      router.push("/s/queue");
    } catch {
      setError(t("staff.networkError"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitEnrol = async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api("AUTH-05.enrol_confirm", {
        body: { code },
      });

      if (!res.ok) {
        if (res.status === 404) {
          setError(t("staff.endpointNotReady"));
        } else if (res.status === 401 || (res.error && res.error.code === "totp_invalid")) {
          setError(t("s01.errors.totpInvalid"));
        } else {
          setError(res.error?.message || t("staff.networkError"));
        }
        return;
      }

      router.push("/s/queue");
    } catch {
      setError(t("staff.networkError"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitInvitePassword = async (password: string) => {
    if (!inviteToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api("AUTH-05.accept_invite", {
        body: { token: inviteToken, password },
      });

      if (!res.ok) {
        if (res.status === 404) {
          setError(t("staff.endpointNotReady"));
        } else if (res.status === 401) {
          setError(t("s01.errors.inviteInvalid"));
        } else {
          setError(res.error?.message || t("staff.networkError"));
        }
        return;
      }

      if (res.data.status === "totp_enrolment_required") {
        await startTotpEnrolment();
      } else {
        router.push("/s/queue");
      }
    } catch {
      setError(t("staff.networkError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SignInView
      step={step}
      email={email}
      error={error}
      loading={loading}
      enrolData={enrolData}
      inviteToken={inviteToken}
      onEmailChange={setEmail}
      onSubmitCredentials={handleSubmitCredentials}
      onSubmitTotp={handleSubmitTotp}
      onSubmitEnrol={handleSubmitEnrol}
      onSubmitInvitePassword={handleSubmitInvitePassword}
      onBackToCredentials={() => {
        setError(null);
        setStep("credentials");
      }}
    />
  );
}

export default function StaffSignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInContainer />
    </Suspense>
  );
}
