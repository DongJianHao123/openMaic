-- Create maic_classroom table for OpenMAIC classroom storage
-- Run this script in your MySQL database

CREATE TABLE IF NOT EXISTS maic_classroom (
  id VARCHAR(255) PRIMARY KEY COMMENT 'Classroom ID',
  stage JSON NOT NULL COMMENT 'Stage data (JSON)',
  scenes JSON NOT NULL COMMENT 'Scenes data (JSON array)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update time',
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MAIC Classroom Storage';
