# Working preferences

- Commit completed implementation requests with appropriate verification. Keep requests in separate commits where practical. Do not push unless requested.
- Keep README.md current with the application's purpose, description, instructions, features, setup, limitations, and verification. Capture real application screenshots when practical; keep README screenshot references working. Do not present mockups as actual screenshots.
- Personal noncommercial use is free under LICENSE. Commercial use outside that license's permitted purposes requires a separately agreed paid commercial license; see COMMERCIAL-LICENSE.md. Do not describe the project as GPL or unrestricted open source.

# Versioning

- Increment the last version component once for a completed minor change or bug fix.
- For a new feature, increment the middle component and reset the last to zero. If the middle component reaches 100, increment the first component and reset the other two to zero.
- Keep package.json, package-lock.json, src-tauri/Cargo.toml, src-tauri/Cargo.lock, src-tauri/tauri.conf.json, the UI version, and the documented current version synchronized. The initial application starts at 0.1.0.
