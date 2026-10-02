export function getClinicPatients(patients) {
  return patients.filter((patient) => !patient.demo)
}
