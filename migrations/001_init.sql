-- Core schema for multi-tenant reporting CRM (MySQL)
CREATE TABLE IF NOT EXISTS clients (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  client_id VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  role ENUM('owner','delegate') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(64) PRIMARY KEY,
  client_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  query_key VARCHAR(128) NOT NULL,
  status ENUM('idle','running') NOT NULL DEFAULT 'idle',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS report_results (
  id VARCHAR(64) PRIMARY KEY,
  report_id VARCHAR(64) NOT NULL,
  client_id VARCHAR(64) NOT NULL,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  data_json JSON NULL,
  error TEXT NULL,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  INDEX idx_results_client_report (client_id, report_id, started_at)
);

-- Encrypted credentials to connect to external client-specific databases
CREATE TABLE IF NOT EXISTS external_db_credentials (
  id VARCHAR(64) PRIMARY KEY,
  client_id VARCHAR(64) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INT NOT NULL DEFAULT 3306,
  username_enc_iv VARCHAR(64) NOT NULL,
  username_enc_tag VARCHAR(64) NOT NULL,
  username_enc_cipher VARCHAR(2048) NOT NULL,
  password_enc_iv VARCHAR(64) NOT NULL,
  password_enc_tag VARCHAR(64) NOT NULL,
  password_enc_cipher VARCHAR(4096) NOT NULL,
  database_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_client_host_db (client_id, host, database_name)
);
