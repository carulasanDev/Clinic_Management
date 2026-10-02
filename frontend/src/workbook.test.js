import test from 'node:test'
import assert from 'node:assert/strict'
import { unzipSync, strFromU8 } from 'fflate'
import { buildWorkbook } from './workbook.js'

test('builds a four-sheet workbook with headers, patient rows, and a single prescription details cell', () => {
  const bytes = buildWorkbook([
    { name: 'Patient Snapshot', title: 'Clinic · Patient Snapshot', headers: ['Patient name', 'Visit status'], rows: [['Avery Jones', 'Waiting']] },
    { name: 'SOAP Notes', title: 'Clinic · SOAP Notes', headers: ['Patient name', 'Subjective'], rows: [['Avery Jones', 'Follow-up visit']] },
    { name: 'Prescriptions', title: 'Clinic · Prescriptions', headers: ['Patient name', 'Prescription details'], rows: [['Avery Jones', 'Medicine A — 10 mg — Daily\nMedicine B — 5 mg — Twice daily']] },
    { name: 'Daily Analytics', title: 'Clinic · Daily Analytics', headers: ['Date', 'Patients checked in'], rows: [['2026-10-01', 1]] },
  ])
  const files = unzipSync(bytes)
  const workbook = strFromU8(files['xl/workbook.xml'])
  assert.match(workbook, /name="Patient Snapshot"/)
  assert.match(workbook, /name="SOAP Notes"/)
  assert.match(workbook, /name="Prescriptions"/)
  assert.match(workbook, /name="Daily Analytics"/)
  const patientSheet = strFromU8(files['xl/worksheets/sheet1.xml'])
  assert.match(patientSheet, /Patient name/)
  assert.match(patientSheet, /Avery Jones/)
  assert.match(patientSheet, /<tableParts count="1">/)
  assert.match(strFromU8(files['xl/tables/table1.xml']), /ref="A2:B3"/)
  const prescriptionSheet = strFromU8(files['xl/worksheets/sheet3.xml'])
  assert.match(prescriptionSheet, /Prescription details/)
  assert.match(prescriptionSheet, /Medicine A/)
  assert.match(prescriptionSheet, /Medicine B/)
})

test('rejects duplicate and invalid worksheet names', () => {
  assert.throws(() => buildWorkbook([
    { name: 'Same', title: 'One', headers: ['A'], rows: [] },
    { name: 'Same', title: 'Two', headers: ['B'], rows: [] },
  ]), /unique, valid Excel names/)
  for (const invalidName of ['Invalid/Name', 'Invalid\\Name', 'Bad*Name', 'Bad?Name', 'Bad:Name', 'Bad[Name', 'Bad]Name']) {
    assert.throws(() => buildWorkbook([
      { name: invalidName, title: 'One', headers: ['A'], rows: [] },
    ]), /unique, valid Excel names/)
  }
})
