import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Edit3, KeyRound, LogOut, Save, ShieldCheck, Smartphone, Sliders, X, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { userApi } from '../../api/services'
import { useAuth } from '../../auth/useAuth'
import { ErrorState, LoadingState } from '../../components/data'
import { Topbar } from '../../components/layout'
import { Badge, Button, FieldShell, Tabs, TextInput } from '../../components/ui'
import { useToastStore } from '../../store/useToastStore'
import './SettingsPage.css'

export function SettingsPage() {
  const auth = useAuth()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'preferences'>('profile')
  const [successNotice, setSuccessNotice] = useState<string | null>(null)
  const [isEditingProfile, setIsEditingProfile] = useState(false)

  // Editor preferences stored in local storage
  const [defaultView, setDefaultView] = useState(() => localStorage.getItem('vf-pref-view') || 'split')
  const [defaultFidelity, setDefaultFidelity] = useState(() => localStorage.getItem('vf-pref-fidelity') || 'adaptive')
  const [autoSave, setAutoSave] = useState(() => localStorage.getItem('vf-pref-autosave') !== 'false')
  const [gridSnap, setGridSnap] = useState(() => localStorage.getItem('vf-pref-gridsnap') !== 'false')

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

  useEffect(() => {
    if (searchParams.get('password_updated') === 'true') {
      setActiveTab('security')
      setSuccessNotice(t('Your password has been successfully updated via the Voltforge Security Shield.'))
      useToastStore.getState().addToast(t('Password updated successfully!'), 'success')
      window.history.replaceState({}, document.title, window.location.pathname)
    } else if (searchParams.get('totp_updated') === 'true') {
      setActiveTab('security')
      setSuccessNotice(t('Two-Factor Authentication (TOTP) has been successfully registered.'))
      useToastStore.getState().addToast(t('2FA Authenticator configured successfully!'), 'success')
      window.history.replaceState({}, document.title, window.location.pathname)
    } else if (searchParams.get('tab') === 'security') {
      setActiveTab('security')
    }
  }, [searchParams, t])

  const updateProfile = useMutation({
    mutationFn: () => userApi.updateProfile({ bio, displayName }),
    onSuccess: () => {
      useToastStore.getState().addToast(t('Profile updated successfully!'), 'success')
      setIsEditingProfile(false)
      void profile.refetch()
    },
  })

  const handleCancelEdit = () => {
    if (profile.data) {
      setDisplayName(profile.data.displayName)
      setBio(profile.data.bio ?? '')
    }
    setIsEditingProfile(false)
  }

  const handleSavePreferences = () => {
    localStorage.setItem('vf-pref-view', defaultView)
    localStorage.setItem('vf-pref-fidelity', defaultFidelity)
    localStorage.setItem('vf-pref-autosave', String(autoSave))
    localStorage.setItem('vf-pref-gridsnap', String(gridSnap))
    useToastStore.getState().addToast(t('Preferences saved successfully!'), 'success')
  }

  const tabItems = [
    { id: 'profile', label: t('Profile & Identity') },
    { id: 'security', label: t('Security & Password') },
    { id: 'preferences', label: t('Preferences') },
  ]

  const initial = displayName ? displayName.charAt(0).toUpperCase() : 'V'
  const userEmail = profile.data?.email ?? auth.user?.email ?? ''
  const username = auth.user?.username || 'volt-user'
  const roleName = auth.user?.role || 'ENGINEER'

  return (
    <>
      <Topbar eyebrow={t("Settings")} title={t("Profile and account")} />
      {profile.isLoading ? <LoadingState label={t("Loading profile")} /> : null}
      {profile.isError ? <ErrorState label={t("Profile API offline")} onRetry={() => void profile.refetch()} /> : null}

      <div className="vf-settings-container">
        {successNotice && (
          <div className="vf-settings-alert-success" role="alert">
            <CheckCircle2 size={18} />
            <span>{successNotice}</span>
          </div>
        )}

        <Tabs
          className="vf-settings-tabs"
          items={tabItems}
          onChange={(id) => setActiveTab(id as 'profile' | 'security' | 'preferences')}
          value={activeTab}
        />

        {/* 1. PROFILE & IDENTITY TAB */}
        {activeTab === 'profile' && (
          <div className="vf-settings-card">
            {!isEditingProfile ? (
              /* VIEW / PRESENTATION MODE */
              <div className="vf-profile-view">
                <div className="vf-profile-view__header">
                  <div className="vf-profile-view__user">
                    <div className="vf-profile-avatar-circle">
                      {initial}
                    </div>
                    <div>
                      <h2 className="vf-profile-view__name">{displayName || auth.user?.displayName}</h2>
                      <div className="vf-profile-view__meta">
                        <span>@{username}</span>
                        <span>·</span>
                        <Badge dot tone="success">{roleName}</Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    icon={<Edit3 size={15} />}
                    onClick={() => setIsEditingProfile(true)}
                    variant="primary"
                  >
                    {t("Edit Profile")}
                  </Button>
                </div>

                <div className="vf-profile-view__grid">
                  <div className="vf-profile-info-item">
                    <span className="vf-profile-info-label">{t("Full Name")}</span>
                    <span className="vf-profile-info-value">{displayName || auth.user?.displayName || '—'}</span>
                  </div>
                  <div className="vf-profile-info-item">
                    <span className="vf-profile-info-label">{t("Email Address")}</span>
                    <span className="vf-profile-info-value">{userEmail}</span>
                  </div>
                  <div className="vf-profile-info-item">
                    <span className="vf-profile-info-label">{t("Username")}</span>
                    <span className="vf-profile-info-value">@{username}</span>
                  </div>
                  <div className="vf-profile-info-item">
                    <span className="vf-profile-info-label">{t("Account Status")}</span>
                    <span className="vf-profile-info-value" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Check size={14} className="text-teal" /> {t("Verified Active")}
                    </span>
                  </div>
                </div>

                <div className="vf-profile-info-item">
                  <span className="vf-profile-info-label">{t("Bio & Description")}</span>
                  {bio ? (
                    <div className="vf-profile-bio-box">
                      {bio.replace(/[^\x20-\x7E\t\n\r]/g, ' ').replace(/\s{2,}/g, ' ')}
                    </div>
                  ) : (
                    <div className="vf-profile-bio-box" style={{ fontStyle: 'italic', opacity: 0.65 }}>
                      {t("No bio written yet. Click 'Edit Profile' to add your summary.")}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* EDIT FORM MODE */
              <div className="vf-profile-edit-form">
                <div className="vf-profile-view__header">
                  <div>
                    <p className="vf-eyebrow">{t("Profile Editor")}</p>
                    <h2 className="vf-profile-view__name">{t("Modify Workspace Identity")}</h2>
                  </div>
                  <Button icon={<X size={15} />} onClick={handleCancelEdit} size="sm">
                    {t("Cancel")}
                  </Button>
                </div>

                <FieldShell label={t("Display Name")}>
                  <TextInput
                    onChange={(event) => setDisplayName(event.target.value)}
                    value={displayName}
                    placeholder={t("Enter your display name")}
                  />
                </FieldShell>

                <FieldShell label={t("Email Address")}>
                  <TextInput disabled value={userEmail} />
                  <span className="vf-pref-desc" style={{ marginTop: 4 }}>
                    {t("Email address is managed by Volt SSO and cannot be modified here.")}
                  </span>
                </FieldShell>

                <FieldShell label={t("Bio & Description")}>
                  <textarea
                    className="vf-bio-textarea"
                    rows={4}
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    placeholder={t("Tell the community about your hardware engineering and projects...")}
                  />
                </FieldShell>

                <div className="component-row" style={{ marginTop: 12 }}>
                  <Button
                    icon={<Save size={16} />}
                    isLoading={updateProfile.isPending}
                    onClick={() => updateProfile.mutate()}
                    variant="primary"
                  >
                    {t("Save Changes")}
                  </Button>
                  <Button icon={<X size={16} />} onClick={handleCancelEdit}>
                    {t("Cancel")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. SECURITY & PASSWORD TAB */}
        {activeTab === 'security' && (
          <div className="vf-security-list">
            {/* Card 1: Password & Credentials */}
            <div className="vf-security-card">
              <div className="vf-security-card__row">
                <div className="vf-security-card__info">
                  <div className="vf-security-card__icon">
                    <KeyRound size={22} />
                  </div>
                  <div>
                    <h3 className="vf-security-card__title">{t("Password & Credentials")}</h3>
                    <p className="vf-security-card__desc">
                      {t("Manage your Voltforge password. Changes enforce enterprise complexity standards and immediately rotate all active sessions across devices.")}
                    </p>
                  </div>
                </div>
                <Button
                  icon={<KeyRound size={16} />}
                  onClick={auth.changePassword}
                  variant="primary"
                >
                  {t("Update Password")}
                </Button>
              </div>

              <div className="vf-security-meta">
                <ShieldCheck size={14} className="text-teal" />
                <span>{t("Guarded by Voltforge Security Shield · 256-Bit TLS Enclave")}</span>
              </div>
            </div>

            {/* Card 2: Two-Factor Authentication (2FA) */}
            <div className="vf-security-card">
              <div className="vf-security-card__row">
                <div className="vf-security-card__info">
                  <div className="vf-security-card__icon">
                    <Smartphone size={22} />
                  </div>
                  <div>
                    <h3 className="vf-security-card__title">{t("Two-Factor Authentication (2FA)")}</h3>
                    <p className="vf-security-card__desc">
                      {t("Protect your workspace using hardware security keys or authenticator apps (Google Authenticator, Microsoft Authenticator, FreeOTP).")}
                    </p>
                  </div>
                </div>
                <Button
                  icon={<Smartphone size={16} />}
                  onClick={auth.configureTotp}
                  variant="secondary"
                >
                  {t("Configure Two-Factor Auth")}
                </Button>
              </div>
            </div>

            {/* Card 3: Active Session Security */}
            <div className="vf-security-card">
              <div className="vf-security-card__row">
                <div>
                  <p className="vf-eyebrow">{t("Session Security")}</p>
                  <h3 className="vf-security-card__title">{t("Active Authenticated Session")}</h3>
                  <p className="vf-security-card__desc" style={{ marginTop: 4 }}>
                    {t("Logged in as")} <strong>{displayName || auth.user?.username}</strong> ({userEmail}). {t("Tokens are automatically validated and refreshed every 50 seconds.")}
                  </p>
                </div>
                <Button icon={<LogOut size={16} />} onClick={auth.logout} size="sm">
                  {t("Logout")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 3. PREFERENCES TAB */}
        {activeTab === 'preferences' && (
          <div className="vf-settings-card">
            <div className="section-heading" style={{ marginBottom: 20 }}>
              <div>
                <p className="vf-eyebrow">{t("Preferences")}</p>
                <h2 className="vf-profile-view__name">{t("Workspace and Editor Settings")}</h2>
              </div>
              <Sliders size={24} />
            </div>

            <div className="vf-pref-group">
              {/* Setting 1: Default Editor Layout */}
              <div className="vf-pref-row">
                <div>
                  <div className="vf-pref-label">{t("Default Studio Layout")}</div>
                  <div className="vf-pref-desc">{t("Initial workspace split layout when opening a circuit project")}</div>
                </div>
                <div className="vf-segmented-pills" role="radiogroup">
                  <button
                    type="button"
                    className={`vf-pill-btn ${defaultView === 'split' ? 'is-active' : ''}`}
                    onClick={() => setDefaultView('split')}
                  >
                    {t("Split View")}
                  </button>
                  <button
                    type="button"
                    className={`vf-pill-btn ${defaultView === 'canvas' ? 'is-active' : ''}`}
                    onClick={() => setDefaultView('canvas')}
                  >
                    {t("Canvas Only")}
                  </button>
                  <button
                    type="button"
                    className={`vf-pill-btn ${defaultView === 'code' ? 'is-active' : ''}`}
                    onClick={() => setDefaultView('code')}
                  >
                    {t("Code Only")}
                  </button>
                </div>
              </div>

              {/* Setting 2: Default Simulation Fidelity */}
              <div className="vf-pref-row">
                <div>
                  <div className="vf-pref-label">{t("Simulation Solver Fidelity")}</div>
                  <div className="vf-pref-desc">{t("Solver timestep and AVR instruction execution slice allocation")}</div>
                </div>
                <div className="vf-segmented-pills" role="radiogroup">
                  <button
                    type="button"
                    className={`vf-pill-btn ${defaultFidelity === 'adaptive' ? 'is-active' : ''}`}
                    onClick={() => setDefaultFidelity('adaptive')}
                  >
                    {t("Adaptive (Fast)")}
                  </button>
                  <button
                    type="button"
                    className={`vf-pill-btn ${defaultFidelity === 'full-fidelity' ? 'is-active' : ''}`}
                    onClick={() => setDefaultFidelity('full-fidelity')}
                  >
                    {t("Strict Real-Time (10 kHz)")}
                  </button>
                </div>
              </div>

              {/* Setting 3: Auto-Save Circuit State */}
              <div className="vf-pref-row">
                <div>
                  <div className="vf-pref-label">{t("Auto-Save Circuit Modifications")}</div>
                  <div className="vf-pref-desc">{t("Automatically persist circuit changes and wire routing every 10 seconds")}</div>
                </div>
                <label className="vf-switch">
                  <input
                    type="checkbox"
                    checked={autoSave}
                    onChange={(e) => setAutoSave(e.target.checked)}
                  />
                  <span className="vf-switch-slider" />
                </label>
              </div>

              {/* Setting 4: Snap to Grid */}
              <div className="vf-pref-row">
                <div>
                  <div className="vf-pref-label">{t("Snap Components & Pins to Grid")}</div>
                  <div className="vf-pref-desc">{t("Align components to 10px pitch grid lines for clean schematics")}</div>
                </div>
                <label className="vf-switch">
                  <input
                    type="checkbox"
                    checked={gridSnap}
                    onChange={(e) => setGridSnap(e.target.checked)}
                  />
                  <span className="vf-switch-slider" />
                </label>
              </div>

              <div className="component-row" style={{ marginTop: 16 }}>
                <Button icon={<Save size={16} />} onClick={handleSavePreferences} variant="primary">
                  {t("Save Preferences")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default SettingsPage
