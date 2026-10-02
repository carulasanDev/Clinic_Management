import test from 'node:test'
import assert from 'node:assert/strict'
import { getClinicPatients } from './patientRecords.js'

test('counts server and local clinic records while excluding fictional samples', () => {
  const patients = [
    { id: 'sample-1', demo: true },
    { id: 'server-1', demo: false },
    { id: 'sample-2', demo: true },
    { id: 'server-2', demo: false },
    { id: 'server-3', demo: false },
    { id: 'server-4', demo: false },
  ]
  assert.deepEqual(getClinicPatients(patients).map((patient) => patient.id), ['server-1', 'server-2', 'server-3', 'server-4'])
})
