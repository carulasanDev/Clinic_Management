# Test the clinic API with Postman

## Import the files

1. In Postman, choose **Import**.
2. Import `AmityMedicalClinic.postman_collection.json`.
3. Import `AmityMedicalClinic-Local.postman_environment.json`.
4. Select **Amity Medical Clinic - Local** from the environment selector.
5. Set the `clinicPassword` environment variable to the current clinic admin password. Keep it local; do not commit or share the environment after entering the password.

The API and database must be running on this computer. The default `baseUrl` is `http://127.0.0.1:8080`. Use the same host for every request so Postman's cookie jar consistently retains the XSRF and session cookies.

## Recommended request order

1. **Authentication → Get CSRF token**
2. **Authentication → Sign in**
3. **Authentication → Get current session**
4. Test **Patients** and **Doctor profile**.
5. **Authentication → Get CSRF token**, then **Authentication → Sign out**.
6. Optional: run **Authorization checks → Unauthenticated patient list (expect 401)** after signing out.

The collection stores the CSRF token returned by the CSRF request and automatically adds it as `X-XSRF-TOKEN` on `POST`, `PUT`, `PATCH`, and `DELETE` requests. Postman handles the cookies. If a write request returns `403`, fetch a fresh CSRF token and retry.

## Endpoints covered

| Method | Path | Access |
| --- | --- | --- |
| `GET` | `/api/auth/csrf` | Public |
| `POST` | `/api/auth/login` | Public; requires CSRF token |
| `GET` | `/api/auth/me` | Authenticated |
| `POST` | `/api/auth/logout` | Authenticated; requires CSRF token |
| `GET` | `/api/patients` | Authenticated |
| `PUT` | `/api/patients/{id}` | Authenticated; requires CSRF token |
| `GET` | `/api/profile` | Authenticated |
| `PUT` | `/api/profile` | Authenticated; requires CSRF token |

The **Create or update patient** request writes an example record with a fixed UUID to the local database. Change `patientId` in the collection variables to use a different record ID. The **Create or update doctor profile** request saves its sample profile on the signed-in account.
