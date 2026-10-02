import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, getCsrf } from './api'
import { getClinicPatients } from './patientRecords'
import './clinic.css'

const CACHE_PREFIX = 'clinic-react-cache-v1:'
const LEGACY_KEY = 'harbor-clinic-care-desk-v1'
const LAST_USER_KEY = 'clinic-react-last-user-v1'
const TABS = [
  ['queue', '▦', 'Queue'],
  ['checkin', '＋', 'Patient intake'],
  ['soap', '▤', 'SOAP workspace'],
  ['prescriptions', '℞', 'Prescriptions'],
  ['records', '▥', 'Patient records'],
  ['profile', '◉', 'Doctor profile'],
  ['sync', '↻', 'Sync logs'],
]
const STATUSES = ['Waiting', 'In Consultation', 'Completed']
const PRIORITIES = ['Routine', 'Priority', 'Urgent']
const APP_DATE = new Date()
const EMPTY_PROFILE = { fullName: '', license: '', specialty: '', clinicName: 'Amity Medical Clinic', contact: '', bio: '', photo: '', signature: '' }
function dateAtOffset(offset) {
  const date = new Date(APP_DATE.getTime())
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  return date
}

const EMPTY_PATIENT = () => ({
  id: crypto.randomUUID(), createdAt: new Date().toISOString(), name: '', age: '', dob: '', sex: '', phone: '',
  complaint: '', triage: 'Routine', status: 'Waiting', demo: false,
  vitals: { bloodPressure: '', pulse: '', temperature: '', height: '', weight: '' },
  soap: { subjective: '', objective: '', assessment: '', plan: '' }, medications: [],
})
const DEMOS = [
  { name: 'Maya Bennett', age: '42', sex: 'Female', phone: '(555) 014-0281', complaint: 'Blood pressure follow-up', triage: 'Priority', status: 'Waiting', vitals: { bloodPressure: '138/86', pulse: '74', temperature: '36.8', height: '165', weight: '68' } },
  { name: 'Ethan Brooks', age: '29', sex: 'Male', phone: '(555) 014-0392', complaint: 'Cough and congestion', triage: 'Routine', status: 'In Consultation', vitals: { bloodPressure: '122/78', pulse: '82', temperature: '37.2', height: '178', weight: '76' } },
  { name: 'Olivia Chen', age: '56', sex: 'Female', phone: '(555) 014-0415', complaint: 'Diabetes review', triage: 'Urgent', status: 'Waiting', vitals: { bloodPressure: '146/91', pulse: '88', temperature: '36.7', height: '160', weight: '71' } },
].map((patient) => ({ ...EMPTY_PATIENT(), ...patient, demo: true }))

const ORDER_SETS = {
  hypertension: {
    name: 'Hypertension Follow-Up',
    soap: {
      subjective: 'Returns for blood pressure follow-up. Reports taking medications as prescribed. Denies headache, chest pain, shortness of breath, or dizziness.',
      objective: 'Blood pressure reviewed. Patient alert and comfortable. Document focused cardiovascular examination.',
      assessment: 'Essential hypertension, follow-up. Review blood pressure trend and medication tolerance.',
      plan: 'Continue current treatment if clinically appropriate. Reinforce reduced-sodium diet, regular activity, and home blood pressure monitoring. Arrange follow-up as indicated.',
    },
  },
  uri: {
    name: 'Acute URI',
    soap: {
      subjective: 'Reports recent onset of upper respiratory symptoms. Review duration, fever, cough, congestion, exposures, and relevant red flags.',
      objective: 'Document temperature, hydration, and focused respiratory and ENT examination.',
      assessment: 'Acute upper respiratory symptoms. Evaluate for complications and likely etiology based on clinical findings.',
      plan: 'Discuss supportive care, hydration, and return precautions. Use testing or medication only when clinically indicated. Reassess if symptoms worsen or persist.',
    },
  },
  diabetes: {
    name: 'Diabetes Management',
    soap: {
      subjective: 'Returns for diabetes review. Discuss home glucose readings, medication adherence, diet, activity, hypoglycemia, and new symptoms.',
      objective: 'Review available glucose and laboratory results. Document weight, blood pressure, and focused examination.',
      assessment: 'Diabetes mellitus, follow-up. Glycemic control and complication risk reviewed with available data.',
      plan: 'Review individualized glucose goals and treatment options. Reinforce nutrition, activity, foot care, and recommended monitoring. Arrange appropriate labs and follow-up.',
    },
  },
}

function newLog(message, result = 'info') {
  return { id: crypto.randomUUID(), time: new Date().toISOString(), message, result }
}

function loadCache(username) {
  const cached = localStorage.getItem(`${CACHE_PREFIX}${username}`)
  if (cached) {
    const parsed = JSON.parse(cached)
    const ownerUsername = Object.prototype.hasOwnProperty.call(parsed, 'ownerUsername') ? parsed.ownerUsername : username
    return { patients: parsed.patients || [], profile: { ...EMPTY_PROFILE, ...parsed.profile }, outbox: parsed.outbox || [], logs: parsed.logs || [], intakeDraft: parsed.intakeDraft || EMPTY_PATIENT(), ownerUsername }
  }
  const legacy = localStorage.getItem(LEGACY_KEY)
  if (legacy) {
    const parsed = JSON.parse(legacy)
    const patients = parsed.patients || []
    const outbox = patients.filter((patient) => !patient.demo).map((patient) => ({ id: crypto.randomUUID(), type: 'patient', patientId: patient.id, payload: patient }))
    const profile = { ...EMPTY_PROFILE, ...parsed.profile }
    const profileHasData = ['fullName', 'license', 'specialty', 'contact', 'bio', 'photo', 'signature'].some((field) => profile[field])
    if (profileHasData) outbox.push({ id: crypto.randomUUID(), type: 'profile', payload: profile })
    return { patients, profile, outbox, logs: [newLog('Imported this browser’s existing clinic data.')], intakeDraft: parsed.intakeDraft || EMPTY_PATIENT(), ownerUsername: null }
  }
  return { patients: DEMOS, profile: EMPTY_PROFILE, outbox: [], logs: [], intakeDraft: EMPTY_PATIENT(), ownerUsername: username === 'offline' ? null : username }
}

function loadOfflineCache() {
  if (localStorage.getItem(`${CACHE_PREFIX}offline`)) return loadCache('offline')
  const lastUsername = localStorage.getItem(LAST_USER_KEY)
  if (lastUsername) return loadCache(lastUsername)
  return loadCache('offline')
}

function loadAccountCache(username) {
  const offlineCache = localStorage.getItem(`${CACHE_PREFIX}offline`) ? loadCache('offline') : null
  if (offlineCache && (!offlineCache.ownerUsername || offlineCache.ownerUsername === username)) {
    return { ...offlineCache, ownerUsername: username }
  }
  return loadCache(username)
}

function combineServerData(cache, patients, profile) {
  const combined = new Map(patients.map((patient) => [patient.id, patient]))
  cache.patients.filter((patient) => patient.demo).forEach((patient) => {
    if (!combined.has(patient.id)) combined.set(patient.id, patient)
  })
  cache.outbox.filter((action) => action.type === 'patient').forEach((action) => {
    combined.set(action.patientId, action.payload)
  })
  const profileHasPendingSave = cache.outbox.some((action) => action.type === 'profile')
  return {
    ...cache,
    patients: [...combined.values()],
    profile: { ...EMPTY_PROFILE, ...(profileHasPendingSave ? cache.profile : profile) },
  }
}

function Login({ onLogin, onOffline, loading, error }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  return (
    <main className="login-screen">
      <form className="panel login-card" onSubmit={(event) => { event.preventDefault(); onLogin(username.trim(), password) }}>
        <div className="brand-mark">+</div>
        <p className="eyebrow">Amity Medical Clinic</p>
        <h1>Care Desk sign in</h1>
        <p className="heading-copy">Sign in to securely access your clinic workspace.</p>
        {error && <div className="error-callout" role="alert">{error}</div>}
        <label className="field">Username<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label className="field">Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button className="button primary login-submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="button login-submit" onClick={onOffline}>Open offline workspace on this device</button>
        <p className="field-hint">Clinic access is provisioned by your administrator. The browser does not store your password. Offline changes stay in this browser and are not uploaded without signing in to the API.</p>
      </form>
    </main>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [tab, setTab] = useState('queue')
  const [data, setData] = useState({ patients: DEMOS, profile: EMPTY_PROFILE, outbox: [], logs: [], intakeDraft: EMPTY_PATIENT() })
  const [offlineMode, setOfflineMode] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [notice, setNotice] = useState('')
  const [queueFilter, setQueueFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [intake, setIntake] = useState(EMPTY_PATIENT)
  const [soapDraft, setSoapDraft] = useState(null)
  const [profileDraft, setProfileDraft] = useState(null)
  const [analyticsRange, setAnalyticsRange] = useState(7)
  const [syncing, setSyncing] = useState(false)
  const [syncOverride, setSyncOverride] = useState(null)
  const dataRef = useRef(data)
  const signatureCanvas = useRef(null)
  const drawing = useRef(false)
  const syncLock = useRef(false)
  const actualOnline = syncOverride === null ? online : syncOverride
  const selected = data.patients.find((patient) => patient.id === selectedId) || data.patients[0] || null
  const toast = useCallback((message) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3600)
  }, [])

  const updateData = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(dataRef.current) : next
    dataRef.current = resolved
    setData(resolved)
  }, [])

  const cacheForUser = useCallback((username, value) => {
    localStorage.setItem(`${CACHE_PREFIX}${username}`, JSON.stringify(value))
  }, [])

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const restoreSession = async () => {
      try {
        const session = await api('/api/auth/me')
        if (!mounted) return
        localStorage.setItem(LAST_USER_KEY, session.username)
        setUser(session)
        const cached = loadAccountCache(session.username)
        // oxlint-disable-next-line react/set-state-in-effect -- Restore the signed-in user's offline cache during session initialization.
        updateData(cached)
        setIntake(cached.intakeDraft)
        try {
          const [patients, profile] = await Promise.all([api('/api/patients'), api('/api/profile')])
          if (!mounted) return
          updateData((current) => combineServerData(current, patients, profile))
        } catch (error) {
          if (error.status !== 401) toast(`Using saved offline data: ${error.message}`)
        }
      } catch (error) {
        if (error.status !== 401) setLoginError(error.message)
      } finally {
        if (mounted) setAuthLoading(false)
      }
    }
    restoreSession()
    return () => { mounted = false }
  }, [toast, updateData])

  useEffect(() => {
    if (!user) return
    try {
      const ownerUsername = user.username === 'offline' ? user.sourceUsername ?? data.ownerUsername ?? null : user.username
      cacheForUser(user.username, { ...data, intakeDraft: intake, ownerUsername })
    } catch {
      // oxlint-disable-next-line react/set-state-in-effect -- Report browser-storage failures while persisting the offline cache.
      toast('Could not cache clinic data in this browser. Export important records and free browser storage.')
    }
  }, [data, user, intake, cacheForUser, toast])

  const persistMutation = useCallback((nextData, type, payload) => {
    const outbox = [...nextData.outbox, { id: crypto.randomUUID(), type, patientId: payload.id, payload }]
    const log = newLog(`${type === 'profile' ? 'Doctor profile' : 'Patient record'} saved on this device.`, 'pending')
    updateData({ ...nextData, outbox, logs: [log, ...nextData.logs].slice(0, 150) })
  }, [updateData])

  const syncPending = useCallback(async () => {
    if (!user || offlineMode || !actualOnline || syncLock.current) return
    syncLock.current = true
    setSyncing(true)
    try {
      await getCsrf()
      while (dataRef.current.outbox.length) {
        const action = dataRef.current.outbox[0]
        if (action.type === 'profile') await api('/api/profile', { method: 'PUT', body: action.payload })
        else await api(`/api/patients/${action.patientId}`, { method: 'PUT', body: action.payload })
        updateData((current) => ({
          ...current,
          outbox: current.outbox.filter((pending) => pending.id !== action.id),
          logs: [newLog('Pending changes synchronized with the server.', 'synced'), ...current.logs].slice(0, 150),
        }))
      }
    } catch (error) {
      if (error.status === 401) {
        setUser(null)
        setLoginError('Your sign-in expired. Sign in again to sync pending changes.')
      } else {
        updateData((current) => ({ ...current, logs: [newLog(`Sync failed: ${error.message}`, 'error'), ...current.logs].slice(0, 150) }))
      }
    } finally {
      syncLock.current = false
      setSyncing(false)
    }
  }, [user, offlineMode, actualOnline, updateData])

  useEffect(() => {
    if (!user || offlineMode || !actualOnline || !data.outbox.length) return
    const timer = window.setTimeout(syncPending, 700)
    return () => window.clearTimeout(timer)
  }, [user, offlineMode, actualOnline, data.outbox, syncPending])

  async function signIn(username, password) {
    setLoginLoading(true)
    setLoginError('')
    try {
      await getCsrf()
      const session = await api('/api/auth/login', { method: 'POST', body: { username, password } })
      const cache = loadAccountCache(session.username)
      localStorage.setItem(LAST_USER_KEY, session.username)
      setUser(session)
      updateData(cache)
      setIntake(cache.intakeDraft)
      setOfflineMode(false)
      try {
        const [patients, profile] = await Promise.all([api('/api/patients'), api('/api/profile')])
        updateData((current) => combineServerData(current, patients, profile))
      } catch (error) {
        toast(`Signed in, but records could not be loaded: ${error.message}`)
      }
    } catch (error) {
      setLoginError(error.message)
    } finally {
      setLoginLoading(false)
    }
  }

  async function signOut() {
    try {
      await getCsrf()
      await api('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      if (error.status !== 401 && error.status !== 0) toast(`Could not close server session: ${error.message}`)
    }
    setUser(null)
    setOfflineMode(false)
    setLoginError('')
  }

  function openPatient(patientId, destination = 'soap') {
    setSelectedId(patientId)
    setTab(destination)
    setSoapDraft(null)
  }

  function updateStatus(patientId, status) {
    const patient = data.patients.find((item) => item.id === patientId)
    if (!patient || !STATUSES.includes(status) || patient.status === status) return
    const updated = { ...patient, status }
    if (patient.demo) {
      updateData({ ...data, patients: data.patients.map((item) => item.id === patientId ? updated : item) })
      toast('Sample visit status updated on this device.')
      return
    }
    persistMutation({ ...data, patients: data.patients.map((item) => item.id === patientId ? updated : item) }, 'patient', updated)
  }

  function saveIntake(event) {
    event.preventDefault()
    if (!intake.name.trim()) return
    const patient = { ...intake, name: intake.name.trim(), createdAt: new Date().toISOString() }
    persistMutation({ ...data, patients: [patient, ...data.patients] }, 'patient', patient)
    setSelectedId(patient.id)
    setIntake(EMPTY_PATIENT())
    setTab('queue')
    toast('Patient checked in and saved locally.')
  }

  function beginSoapEdit() {
    if (selected) setSoapDraft({ soap: { ...selected.soap }, medications: selected.medications.map((med) => ({ ...med })) })
  }

  function saveSoap() {
    if (!selected || !soapDraft || selected.demo) return
    const patient = { ...selected, soap: soapDraft.soap, medications: soapDraft.medications }
    persistMutation({ ...data, patients: data.patients.map((item) => item.id === patient.id ? patient : item) }, 'patient', patient)
    setSoapDraft(null)
    toast('SOAP note and prescription saved locally.')
  }

  function addMedication() {
    setSoapDraft((draft) => ({ ...draft, medications: [...draft.medications, { name: '', dose: '', frequency: '', duration: '' }] }))
  }

  function updateMedication(index, field, value) {
    setSoapDraft((draft) => ({ ...draft, medications: draft.medications.map((item, row) => row === index ? { ...item, [field]: value } : item) }))
  }

  function applyOrderSet(key) {
    const order = ORDER_SETS[key]
    setSoapDraft((draft) => ({ ...draft, soap: { ...order.soap }, medications: draft.medications.length ? draft.medications : [{ name: '', dose: '', frequency: '', duration: '' }] }))
    toast(`${order.name} loaded as an unsaved draft.`)
  }

  function saveProfile() {
    if (!profileDraft) return
    persistMutation({ ...data, profile: profileDraft }, 'profile', profileDraft)
    setProfileDraft(null)
    toast('Doctor profile saved locally.')
  }

  async function uploadImage(file) {
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      toast('Choose a PNG or JPEG image under 2 MB.')
      return
    }
    const reader = new FileReader()
    reader.onerror = () => toast('Could not read the selected image.')
    reader.onload = () => setProfileDraft((profile) => ({ ...profile, photo: String(reader.result) }))
    reader.readAsDataURL(file)
  }

  function saveSignature() {
    const canvas = signatureCanvas.current
    if (!canvas || !profileDraft) return
    setProfileDraft({ ...profileDraft, signature: canvas.toDataURL('image/png') })
    toast('Signature added to the unsaved profile draft.')
  }

  function drawStart(event) {
    const canvas = signatureCanvas.current
    if (!canvas) return
    drawing.current = true
    const rect = canvas.getBoundingClientRect()
    const context = canvas.getContext('2d')
    context.beginPath()
    context.moveTo((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height)
    canvas.setPointerCapture(event.pointerId)
  }

  function drawMove(event) {
    if (!drawing.current || !signatureCanvas.current) return
    const canvas = signatureCanvas.current
    const rect = canvas.getBoundingClientRect()
    const context = canvas.getContext('2d')
    context.lineWidth = 2.5
    context.lineCap = 'round'
    context.strokeStyle = '#183447'
    context.lineTo((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height)
    context.stroke()
  }

  async function exportWorkbook() {
    const activePatients = getClinicPatients(data.patients)
    const snapshot = activePatients.map((patient) => ({
      'Patient ID': patient.id, 'Patient name': patient.name, Age: patient.age, Sex: patient.sex, Phone: patient.phone,
      'Check-in date/time': patient.createdAt, 'Chief complaint': patient.complaint, 'Triage priority': patient.triage,
      'Visit status': patient.status, 'Blood pressure': patient.vitals?.bloodPressure, 'Pulse (bpm)': patient.vitals?.pulse,
      'Temperature (°C)': patient.vitals?.temperature, 'Height (cm)': patient.vitals?.height, 'Weight (kg)': patient.vitals?.weight,
    }))
    const soap = activePatients.map((patient) => ({ 'Patient name': patient.name, 'Check-in date/time': patient.createdAt, ...patient.soap }))
    const prescriptions = activePatients.map((patient) => ({
      'Patient name': patient.name,
      'Prescription details': (patient.medications || []).map((med) => [med.name, med.dose, med.frequency, med.duration].filter(Boolean).join(' — ')).filter(Boolean).join('\n'),
    }))
    const days = Array.from({ length: analyticsRange }, (_, index) => {
      const date = dateAtOffset(-(analyticsRange - index - 1))
      const key = date.toLocaleDateString()
      return { Date: key, 'Patients checked in': activePatients.filter((patient) => new Date(patient.createdAt).toLocaleDateString() === key).length }
    })
    const { buildWorkbook } = await import('./workbook')
    const bytes = buildWorkbook([
      { name: 'Patient Snapshot', title: 'Amity Medical Clinic · Patient Snapshot', headers: snapshot.length ? Object.keys(snapshot[0]) : ['Patient ID', 'Patient name'], rows: snapshot.map((row) => Object.values(row)) },
      { name: 'SOAP Notes', title: 'Amity Medical Clinic · SOAP Notes', headers: soap.length ? Object.keys(soap[0]) : ['Patient name', 'Check-in date/time', 'subjective', 'objective', 'assessment', 'plan'], rows: soap.map((row) => Object.values(row)) },
      { name: 'Prescriptions', title: 'Amity Medical Clinic · Prescriptions', headers: ['Patient name', 'Prescription details'], rows: prescriptions.map((row) => Object.values(row)) },
      { name: 'Daily Analytics', title: 'Amity Medical Clinic · Daily Analytics', headers: ['Date', 'Patients checked in'], rows: days.map((row) => Object.values(row)) },
    ])
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `clinic-patient-records-${new Date().toISOString().slice(0, 10)}.xlsx`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast('Excel workbook exported.')
  }

  const visiblePatients = useMemo(() => data.patients.filter((patient) => (queueFilter === 'All' || patient.status === queueFilter) && `${patient.name} ${patient.complaint} ${patient.phone}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => PRIORITIES.indexOf(a.triage) - PRIORITIES.indexOf(b.triage) || new Date(a.createdAt) - new Date(b.createdAt)), [data.patients, queueFilter, query])
  const clinicPatients = getClinicPatients(data.patients)
  const analytics = Array.from({ length: analyticsRange }, (_, index) => {
    const date = dateAtOffset(-(analyticsRange - index - 1))
    return { date, count: clinicPatients.filter((patient) => new Date(patient.createdAt).toDateString() === date.toDateString()).length }
  })
  const maxDaily = Math.max(1, ...analytics.map((day) => day.count))

  if (authLoading) return <main className="login-screen"><div className="panel login-card">Checking secure session…</div></main>
  if (!user) return <Login onLogin={signIn} onOffline={() => { const cache = loadOfflineCache(); updateData(cache); setIntake(cache.intakeDraft); setOfflineMode(true); setUser({ username: 'offline', sourceUsername: cache.ownerUsername }) }} loading={loginLoading} error={loginError} />

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">+</div><div><div className="brand-name">{data.profile.clinicName || 'Amity Medical Clinic'}</div><div className="brand-sub">Care Desk</div></div></div>
        <div className="topbar-right"><span className="date-label">{new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(APP_DATE)}</span><span className={`network-pill${actualOnline ? '' : ' offline'}`}><span className="network-dot" />{offlineMode ? 'Offline workspace' : actualOnline ? 'Online' : 'Offline · saved locally'}</span>{data.profile.photo ? <img className="profile-mini" src={data.profile.photo} alt="Doctor profile" /> : <span className="profile-mini">{data.profile.fullName ? data.profile.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() : 'DR'}</span>}<button className="button small" onClick={signOut}>{offlineMode ? 'Exit offline' : 'Sign out'}</button></div>
      </header>
      <div className="layout">
        <aside className="sidebar"><div className="side-caption">Workspace</div><nav className="nav-list" aria-label="Main navigation">{TABS.map(([key, icon, label]) => <button key={key} className={`nav-button${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}><span className="nav-icon">{icon}</span>{label}{key === 'queue' && <span className="nav-count">{data.patients.filter((p) => p.status !== 'Completed').length}</span>}{key === 'records' && <span className="nav-count">{clinicPatients.length}</span>}{key === 'sync' && <span className="nav-count">{data.outbox.length}</span>}</button>)}</nav><div className="sidebar-note"><strong>{offlineMode ? 'Offline workspace' : 'Protected clinic workspace'}</strong>{offlineMode ? 'Changes stay on this device. Sign in online to synchronize pending edits.' : 'Server records require your clinic sign-in. Unsynced changes remain on this device.'}</div></aside>
        <main className="main-content">
          {tab === 'queue' && <section>
            <Heading eyebrow="Clinic overview" title={`Good ${APP_DATE.getHours() < 12 ? 'morning' : APP_DATE.getHours() < 17 ? 'afternoon' : 'evening'}${data.profile.fullName ? `, Dr. ${data.profile.fullName.split(' ').at(-1)}` : ''}`} description="Today’s clinic queue and visit status." action={<button className="button primary" onClick={() => setTab('checkin')}>＋ Check in patient</button>} />
            <div className="stats-grid">{[['Waiting', data.patients.filter((p) => p.status === 'Waiting').length, 'Ready to be seen'], ['In consultation', data.patients.filter((p) => p.status === 'In Consultation').length, 'With the care team'], ['Completed today', data.patients.filter((p) => p.status === 'Completed').length, 'Visits marked complete'], ['Pending sync', data.outbox.length, actualOnline ? 'Saved locally · syncing in background' : 'Will sync when connected']].map(([label, count, note]) => <Stat key={label} label={label} value={count} note={note} />)}</div>
            <div className="panel"><PanelHead title="Patient queue" description="Triage, visit status, and check-in details" right={`${data.patients.length} total`} /><div className="queue-toolbar"><label className="search-wrap"><span className="search-symbol">⌕</span><input type="search" placeholder="Search patients..." value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search patients" /></label><div className="filter-row">{['All', ...STATUSES].map((filter) => <button key={filter} className={`filter-button${queueFilter === filter ? ' active' : ''}`} onClick={() => setQueueFilter(filter)}>{filter}</button>)}</div></div><p className="queue-hint">Sample visit statuses can be changed for testing; sample records are not sent to the server.</p>
              {visiblePatients.length ? <div className="table-wrap"><table><thead><tr><th>Patient</th><th>Chief complaint</th><th>Triage</th><th>Checked in</th><th>Visit status</th><th>Actions</th></tr></thead><tbody>{visiblePatients.map((patient) => <tr key={patient.id}><td><div className="patient-cell"><span className="avatar">{patient.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><div><div className="patient-name">{patient.name}</div><div className="patient-meta">{patient.age || 'Age not recorded'}{patient.sex ? ` · ${patient.sex}` : ''}{patient.demo ? ' · sample record' : ''}</div></div></div></td><td>{patient.complaint || 'Not specified'}</td><td><Badge value={patient.triage} /></td><td>{new Date(patient.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</td><td><div className={`status-control ${patient.status.toLowerCase().replaceAll(' ', '-')}`}><span className="status-indicator" /><select aria-label={`Visit status for ${patient.name}`} value={patient.status} onChange={(event) => updateStatus(patient.id, event.target.value)}><option>Waiting</option><option>In Consultation</option><option>Completed</option></select></div></td><td><button className="button small soft" onClick={() => openPatient(patient.id)}>Open chart</button></td></tr>)}</tbody></table></div> : <Empty title="No matching patients" detail="Try a different filter or check in a patient." />}
            </div>
          </section>}
          {tab === 'checkin' && <section><Heading eyebrow="Patient intake" title="Check in a patient" description="Patient details save on this device first." /><form className="panel panel-body" onSubmit={saveIntake}><FormGrid><Field label="Patient name" required><input required value={intake.name} onChange={(e) => setIntake({ ...intake, name: e.target.value })} /></Field><Field label="Age"><input type="number" min="0" value={intake.age} onChange={(e) => setIntake({ ...intake, age: e.target.value })} /></Field><Field label="Date of birth"><input type="date" value={intake.dob} onChange={(e) => setIntake({ ...intake, dob: e.target.value })} /></Field><Field label="Sex"><select value={intake.sex} onChange={(e) => setIntake({ ...intake, sex: e.target.value })}><option value="">Select</option><option>Female</option><option>Male</option><option>Other</option><option>Prefer not to say</option></select></Field><Field label="Phone"><input type="tel" value={intake.phone} onChange={(e) => setIntake({ ...intake, phone: e.target.value })} /></Field><Field label="Triage priority"><select value={intake.triage} onChange={(e) => setIntake({ ...intake, triage: e.target.value })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></Field><Field label="Chief complaint" full><textarea value={intake.complaint} onChange={(e) => setIntake({ ...intake, complaint: e.target.value })} /></Field>{[['bloodPressure', 'Blood pressure'], ['pulse', 'Pulse (bpm)'], ['temperature', 'Temperature (°C)'], ['height', 'Height (cm)'], ['weight', 'Weight (kg)']].map(([key, label]) => <Field key={key} label={label}><input value={intake.vitals[key]} onChange={(e) => setIntake({ ...intake, vitals: { ...intake.vitals, [key]: e.target.value } })} /></Field>)}</FormGrid><div className="heading-actions"><button type="button" className="button" onClick={() => setIntake(EMPTY_PATIENT())}>Cancel</button><button className="button primary">Check in patient</button></div></form></section>}
          {tab === 'soap' && <section><Heading eyebrow="Clinical workstation" title="SOAP workspace" description={selected ? `Chart for ${selected.name}` : 'Select a patient from the queue to open a chart.'} action={selected && !soapDraft && !selected.demo ? <button className="button primary" onClick={beginSoapEdit}>Edit note</button> : null} />{selected ? <><div className="panel patient-snapshot"><strong>{selected.name}</strong><span>{selected.age || 'Age not recorded'}{selected.sex ? ` · ${selected.sex}` : ''}</span><span>{selected.complaint || 'No complaint recorded'}</span><div className="vital-grid">{Object.entries(selected.vitals || {}).map(([key, value]) => <div key={key} className="vital-tile"><span>{key.replace(/([A-Z])/g, ' $1')}</span><strong>{value || '—'}</strong></div>)}</div></div>{selected.demo && <p className="info-callout">This is a fictional sample record. Check in a patient to create and save a chart.</p>}{soapDraft && <div className="order-row">Quick order set: {Object.entries(ORDER_SETS).map(([key, order]) => <button className="button small" key={key} onClick={() => applyOrderSet(key)}>{order.name}</button>)}</div>}<div className="panel panel-body"><FormGrid>{[['subjective', 'Subjective'], ['objective', 'Objective'], ['assessment', 'Assessment'], ['plan', 'Plan']].map(([key, label]) => <Field key={key} label={label} full><textarea readOnly={!soapDraft} value={(soapDraft || selected).soap?.[key] || ''} onChange={(e) => setSoapDraft({ ...soapDraft, soap: { ...soapDraft.soap, [key]: e.target.value } })} /></Field>)}</FormGrid><h2 className="panel-title section-title">Prescription details</h2><MedicationEditor medications={soapDraft ? soapDraft.medications : selected.medications} editable={Boolean(soapDraft)} onChange={updateMedication} onAdd={addMedication} /><div className="heading-actions">{soapDraft && <><button className="button" onClick={() => setSoapDraft(null)}>Cancel</button><button className="button primary" onClick={saveSoap}>Save SOAP note</button></>}{!soapDraft && !selected.demo && <button className="button" onClick={() => setTab('prescriptions')}>View prescription</button>}</div></div></> : <Empty title="No patient selected" detail="Check in or select a patient from the queue." />}</section>}
          {tab === 'prescriptions' && <section><Heading eyebrow="Medication management" title="Prescriptions" description="Review the active patient’s medication details and print a prescription." action={selected && <button className="button primary" onClick={() => window.print()}>Print prescription</button>} />{selected ? <div className="panel"><PanelHead title={selected.name} description={selected.complaint || 'Patient visit'} right={<Badge value={selected.status} />} /><div className="panel-body"><PrescriptionPreview patient={selected} profile={data.profile} /><div className="heading-actions"><button className="button" onClick={() => openPatient(selected.id, 'soap')}>Edit in SOAP workspace</button><button className="button primary" onClick={() => window.print()}>Print prescription</button></div></div></div> : <Empty title="No patient selected" detail="Select a patient from the queue first." />}</section>}
          {tab === 'records' && <section><Heading eyebrow="Data analytics" title="Patient records" description="Visit trends and exportable patient snapshots." action={<><select aria-label="Analytics date range" value={analyticsRange} onChange={(event) => setAnalyticsRange(Number(event.target.value))}><option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option></select><button className="button primary" onClick={() => exportWorkbook().catch((error) => toast(`Excel export failed: ${error.message}`))}>Export to Excel</button></>} /><div className="analytics-summary"><Stat label="Patient records" value={clinicPatients.length} note="Clinic visits · sample records excluded" /><Stat label="Waiting" value={clinicPatients.filter((p) => p.status === 'Waiting').length} note="Ready to be seen" /><Stat label="In consultation" value={clinicPatients.filter((p) => p.status === 'In Consultation').length} note="Currently with care team" /><Stat label="Completed" value={clinicPatients.filter((p) => p.status === 'Completed').length} note="Visit status completed" /></div><div className="analytics-layout"><div className="panel"><PanelHead title="Daily patient visits" description={`Check-ins over the last ${analyticsRange} days`} /><div className="panel-body chart-list">{analytics.map(({ date, count }) => <div className="chart-row" key={date.toISOString()}><span className="chart-date">{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><div className="chart-track"><div className="chart-bar" style={{ width: `${count / maxDaily * 100}%` }} /></div><span className="chart-count">{count}</span></div>)}</div></div><div className="panel"><PanelHead title="Recent visits" /><div className="panel-body record-list">{clinicPatients.slice(0, 8).map((patient) => <div className="record-card" key={patient.id}><div className="record-card-top"><strong>{patient.name}</strong><Badge value={patient.triage} /></div><p className="patient-meta">{new Date(patient.createdAt).toLocaleDateString()} · {patient.complaint || 'No complaint'}</p><div className="record-card-actions"><button className="button small" onClick={() => openPatient(patient.id, 'soap')}>SOAP note</button><button className="button small" onClick={() => openPatient(patient.id, 'prescriptions')}>Prescription</button></div></div>)}{!clinicPatients.length && <Empty title="No patient records yet" detail="New patient visits will appear here." />}</div></div></div><p className="analytics-footnote">Fictional sample patients appear in the queue for testing and are excluded from patient-record totals and exports.</p></section>}
          {tab === 'profile' && <section><Heading eyebrow="Practice settings" title="Doctor profile" description="Your professional identity appears on printable prescriptions." action={!profileDraft ? <button className="button primary" onClick={() => setProfileDraft({ ...data.profile })}>Edit profile</button> : <><button className="button" onClick={() => setProfileDraft(null)}>Cancel</button><button className="button primary" onClick={saveProfile}>Save</button></>} /><div className="profile-layout"><div className="panel panel-body"><div className="profile-top">{profileDraft?.photo || data.profile.photo ? <img className="profile-photo" src={profileDraft?.photo || data.profile.photo} alt="Doctor profile" /> : <div className="profile-photo">{data.profile.fullName?.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'DR'}</div>}{profileDraft && <Field label="Profile picture"><input type="file" accept="image/png,image/jpeg" onChange={(event) => uploadImage(event.target.files?.[0])} /></Field>}</div><FormGrid>{[['fullName', 'Full name'], ['license', 'Medical license #'], ['specialty', 'Specialty'], ['clinicName', 'Clinic name'], ['contact', 'Contact information'], ['bio', 'Brief bio']].map(([key, label]) => <Field label={label} key={key} full={key === 'bio'}>{key === 'bio' ? <textarea disabled={!profileDraft} value={(profileDraft || data.profile)[key] || ''} onChange={(e) => setProfileDraft({ ...profileDraft, [key]: e.target.value })} /> : <input disabled={!profileDraft} value={(profileDraft || data.profile)[key] || ''} onChange={(e) => setProfileDraft({ ...profileDraft, [key]: e.target.value })} />}</Field>)}</FormGrid></div><div className="panel panel-body"><h2 className="panel-title">Digital signature</h2><p className="panel-description">Draw with a mouse, stylus, or touch. Save it to the profile draft.</p><canvas ref={signatureCanvas} className="signature-canvas" width="560" height="190" onPointerDown={drawStart} onPointerMove={drawMove} onPointerUp={() => { drawing.current = false }} onPointerCancel={() => { drawing.current = false }} />{(profileDraft?.signature || data.profile.signature) && <img className="signature-preview" src={profileDraft?.signature || data.profile.signature} alt="Saved doctor signature" />}<div className="signature-actions"><button className="button small" disabled={!profileDraft} onClick={() => { const context = signatureCanvas.current?.getContext('2d'); context?.clearRect(0, 0, signatureCanvas.current.width, signatureCanvas.current.height) }}>Clear pad</button><button className="button primary small" disabled={!profileDraft} onClick={saveSignature}>Save signature</button></div><p className="disclaimer">A drawn signature image is not a verified electronic signature. Follow applicable identity, consent, privacy, and prescribing requirements.</p></div></div></section>}
          {tab === 'sync' && <section><Heading eyebrow="Data & connectivity" title="Sync logs" description="Review connectivity, pending local changes, and sync results." action={<button disabled={!actualOnline || !data.outbox.length || syncing || offlineMode} className="button primary" onClick={syncPending}>{syncing ? 'Syncing…' : 'Sync now'}</button>} /><div className="profile-layout"><div className="panel"><PanelHead title="Activity" description="Patient details are not included in this log." right={`${data.outbox.length} pending`} />{data.logs.length ? <div className="table-wrap"><table className="log-table"><thead><tr><th>Time</th><th>Activity</th><th>Result</th></tr></thead><tbody>{data.logs.map((log) => <tr key={log.id}><td>{new Date(log.time).toLocaleString()}</td><td>{log.message}</td><td><Badge value={log.result} /></td></tr>)}</tbody></table></div> : <Empty title="No activity yet" detail="Local saves and sync attempts will appear here." />}</div><div className="panel panel-body"><h2 className="panel-title">Connection & sync</h2><div className="sync-status"><span className="sync-status-icon">{actualOnline ? '●' : '◌'}</span><div><strong>{actualOnline ? 'Device appears online' : 'Offline mode'}</strong><span>{data.outbox.length ? `${data.outbox.length} changes are waiting to synchronize.` : 'No pending changes.'}</span></div></div><div className="field"><label>Network test override</label><button className="button" onClick={() => setSyncOverride(syncOverride === null ? !online : null)}>{syncOverride === true ? '✓ Force online · use device status' : syncOverride === false ? '✓ Force offline · use device status' : 'Use actual network status'}</button></div><p className="field-hint">Changes are written locally first. When connected and signed in, they are sent to the authenticated clinic API.</p></div></div></section>}
        </main>
      </div>
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  )
}

function Heading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="heading-copy">{description}</p></div>{action && <div className="heading-actions">{action}</div>}</div>
}
function Stat({ label, value, note }) { return <div className="stat-card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div> }
function PanelHead({ title, description, right }) { return <div className="panel-head"><div><h2 className="panel-title">{title}</h2>{description && <p className="panel-description">{description}</p>}</div>{right && (typeof right === 'string' ? <span className="badge">{right}</span> : right)}</div> }
function Badge({ value }) { return <span className={`badge ${String(value).toLowerCase().replaceAll(' ', '-')}`}>{value}</span> }
function Empty({ title, detail }) { return <div className="empty-state"><strong>{title}</strong><span>{detail}</span></div> }
function Field({ label, children, full, required }) { return <label className={`field${full ? ' full' : ''}`}>{label}{required && ' *'}{children}</label> }
function FormGrid({ children }) { return <div className="form-grid">{children}</div> }
function MedicationEditor({ medications, editable, onChange, onAdd }) {
  if (!medications?.length && !editable) return <Empty title="No medication details" detail="Medication directions saved to this chart will appear here." />
  return <div className="medication-list">{(medications || []).map((med, index) => <div className="medication-row" key={index}>{[['name', 'Medication'], ['dose', 'Dose'], ['frequency', 'Frequency'], ['duration', 'Duration']].map(([field, label]) => <label className="field" key={field}>{label}<input disabled={!editable} value={med[field] || ''} onChange={(event) => onChange(index, field, event.target.value)} /></label>)}</div>)}{editable && <button className="button small" onClick={onAdd}>＋ Add medication</button>}</div>
}
function PrescriptionPreview({ patient, profile }) {
  const meds = patient.medications?.filter((med) => med.name || med.dose || med.frequency || med.duration) || []
  return <div className="prescription-preview"><div className="prescription-brand"><div><h2>{profile.clinicName || 'Clinic'}</h2><p>{profile.fullName}{profile.specialty ? ` · ${profile.specialty}` : ''}</p><p>License: {profile.license || 'Not provided'} · {profile.contact}</p></div>{profile.photo && <img className="profile-photo" src={profile.photo} alt="" />}</div><hr /><p><strong>Patient:</strong> {patient.name} · {patient.age || 'Age not recorded'} · {new Date(patient.createdAt).toLocaleDateString()}</p><p><strong>Chief complaint:</strong> {patient.complaint || '—'}</p>{meds.length ? <ol>{meds.map((med, index) => <li key={index}><strong>{med.name || 'Medication'}</strong><div>{[med.dose, med.frequency, med.duration].filter(Boolean).join(' · ')}</div></li>)}</ol> : <p>No medication instructions have been recorded.</p>}{patient.soap?.plan && <p><strong>Plan:</strong> {patient.soap.plan}</p>}<div className="prescription-signature">{profile.signature ? <img className="signature-preview" src={profile.signature} alt="Doctor signature" /> : <span className="signature-line" />}<span>{profile.fullName || 'Prescriber'} · {profile.license || 'License not provided'}</span></div><p className="disclaimer">This printout is a clinic record and does not replace a legally compliant prescription.</p></div>
}

export default App
