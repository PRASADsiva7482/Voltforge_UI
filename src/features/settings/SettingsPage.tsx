import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LogOut, Save, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { userApi } from '../../api/services'
import { useAuth } from '../../auth/useAuth'
import { ErrorState, LoadingState } from '../../components/data'
import { Topbar } from '../../components/layout'
import { Box, Button, FieldShell, TextInput, Textarea } from '../../components/ui'

export function SettingsPage() {
  const auth = useAuth()
  const { t } = useTranslation()
  const profile = useQuery({
    queryFn: () => userApi.getProfile().then((res) => res.data.data),
    queryKey: ['user', 'profile'],
  })
  const [displayName, setDisplayName] = useState(auth.user?.displayName ?? '')
  const [bio, setBio] = useState('')

  useEffect(() => {
    if (profile.data) {
      setDisplayName(profile.data.displayName)
      setBio(profile.data.bio ?? '')
    }
  }, [profile.data])

  const updateProfile = useMutation({
    mutationFn: () => userApi.updateProfile({ bio, displayName }),
    onSuccess: () => void profile.refetch(),
  })

  return (
    <>
      <Topbar eyebrow={t("Settings")} title={t("Profile and account")} />
      {profile.isLoading ? <LoadingState label={t("Loading profile")} /> : null}
      {profile.isError ? <ErrorState label={t("Profile API offline")} onRetry={() => void profile.refetch()} /> : null}
      <section className="form-page">
        <Box tone="raised">
          <div className="section-heading">
            <div>
              <p className="vf-eyebrow">{t("Profile")}</p>
              <h2>{t("Workspace identity")}</h2>
            </div>
            <ShieldCheck size={26} />
          </div>
          <div className="form-grid">
            <FieldShell label={t("Display name")}>
              <TextInput onChange={(event) => setDisplayName(event.target.value)} value={displayName} />
            </FieldShell>
            <FieldShell label={t("Email")}>
              <TextInput disabled value={profile.data?.email ?? auth.user?.email ?? ''} />
            </FieldShell>
            <FieldShell label={t("Bio")}>
              <Textarea onChange={(event) => setBio(event.target.value)} rows={4} value={bio} />
            </FieldShell>
          </div>
          <div className="component-row">
            <Button icon={<Save size={16} />} isLoading={updateProfile.isPending} onClick={() => updateProfile.mutate()} variant="primary">
              {t("Save profile")}
            </Button>
            <Button icon={<LogOut size={16} />} onClick={auth.logout}>
              {t("Logout")}
            </Button>
          </div>
        </Box>
        <Box tone="accent">
          <p className="vf-eyebrow">{t("Security")}</p>
          <h3>{t("Secured Session")}</h3>
          <p className="vf-muted">{t("Login credentials, token refresh, and session management are protected by secure authentication protocols.")}</p>
        </Box>
      </section>
    </>
  )
}
