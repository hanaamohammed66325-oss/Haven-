"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { MotionRoot, Press, PressLink } from "@/components/motion/Press";
import { SURFACE } from "@/components/motion/springs";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { GROUP_STUDY_ENABLED, openingDateLabel } from "@/lib/featureFlags";
import { ComingSoon } from "@/components/ComingSoon";
import { clearStudyDestination, rememberStudyDestination } from "@/lib/study/destination";
import { joinStudyGroup, previewStudyInvite } from "@/lib/study/client";
import { AppearanceFields, appearanceValid } from "@/components/study/AppearanceFields";
import type { JoinPreview, StudyAppearance } from "@/lib/study/types";
export default function JoinPage() {
  return <Suspense><Join /></Suspense>;
}
function Join() {
  const { t, lang } = useT();
  const { authStatus, hydrated, accountId, profileName, haviName } = useStore();
  const token = useSearchParams().get("t") ?? "";
  const router = useRouter();
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const joining = useRef(false);
  const [look, setLook] = useState<StudyAppearance | null>(null);
  const valid = /^[0-9a-f]{32}$/i.test(token);
  const appearance = look ?? { displayName: profileName ?? "", haviName: haviName || "Havi", haviColor: "#a8d98a", flowerColor: "#edb7c8" };
  useEffect(() => setLook(null), [accountId, token]);
  useEffect(() => {
    const mine = ++request.current;
    setPreview(null); setError(false); setBusy(false); joining.current = false;
    if (!GROUP_STUDY_ENABLED || !valid) return;
    rememberStudyDestination(`/join/?t=${token}`);
    if (authStatus === "signedIn" && hydrated && accountId) {
      previewStudyInvite(token).then((p) => { if (request.current === mine) setPreview(p); }, () => { if (request.current === mine) setError(true); });
    }
    return () => { ++request.current; };
  }, [token, valid, authStatus, hydrated, accountId, retry]);
  const join = async () => {
    if (joining.current || !preview?.ok || !appearanceValid(appearance)) return;
    const mine = request.current;
    joining.current = true; setBusy(true); setError(false);
    try {
      const id = await joinStudyGroup(token, appearance);
      if (mine !== request.current) return;
      clearStudyDestination(); router.replace(`/study/?g=${id}`);
    } catch { if (mine === request.current) setError(true); }
    finally { if (mine === request.current) { joining.current = false; setBusy(false); } }
  };
  if (!GROUP_STUDY_ENABLED) return <ComingSoon title={t("study_title")} desc={t("study_soonBody", { date: openingDateLabel(lang) })} />;
  return <MotionRoot><motion.main className="mx-auto flex max-w-lg flex-col gap-4 p-6"
    initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={SURFACE}>
    <h1 className="text-xl font-semibold">{t("study_inviteTitle")}</h1>
    {!valid ? <p>{t("study_invalidInvite")}</p> : authStatus === "signedOut" ? <>
      <p>{t("study_inviteSignIn")}</p><PressLink lift="none" className="haven-btn rounded-xl p-3" href="/signin">{t("authSignIn")}</PressLink>
      <PressLink lift="none" href="/signup">{t("authCreateAccount")}</PressLink>
    </> : <>
      {preview ? <>
        <h2 className="text-lg">{preview.name}</h2>
        {preview.reason === "already_member" && preview.groupId ? <Press lift="none" className="haven-btn rounded-xl p-3" onClick={() => { clearStudyDestination(); router.replace(`/study/?g=${preview.groupId}`); }}>{t("study_enter")}</Press> : preview.ok ? <>
          <p>{t("study_inviteConfirm")}</p><AppearanceFields value={appearance} onChange={setLook} />
          <Press lift="none" className="haven-btn rounded-xl p-3 disabled:opacity-50" disabled={busy || !appearanceValid(appearance)} onClick={() => void join()}>{t("study_join")}</Press>
        </> : <p>{t(preview.reason === "group_limit" ? "study_limitGroups" : preview.reason === "full" ? "study_inviteFull" : "study_invalidInvite")}</p>}
      </> : !error && <p>{t("study_loading")}</p>}
      {error && <p role="alert">{t("study_errNetwork")} <Press lift="none" className="underline" onClick={() => setRetry((n) => n + 1)}>{t("study_retry")}</Press></p>}
    </>}
    <PressLink lift="none" href="/dashboard" onClick={clearStudyDestination}>{t("study_inviteCancel")}</PressLink>
  </motion.main></MotionRoot>;
}
