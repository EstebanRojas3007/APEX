-- Solo proveedor de autenticación LOCAL de demostración. Fuera del dominio.
CREATE TABLE IF NOT EXISTS auth_identity (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auth_session (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES auth_identity(id), last_activity BIGINT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('menu','exam')));
CREATE TABLE IF NOT EXISTS auth_throttle (email TEXT PRIMARY KEY, failures INTEGER NOT NULL, window_start BIGINT NOT NULL, locked_until BIGINT NOT NULL);
