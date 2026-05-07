DROP DATABASE IF EXISTS trapico;
CREATE DATABASE trapico CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE trapico;


-- ============================================================
-- 1. USERS (Central identity table - base for all four roles)
-- ============================================================
CREATE TABLE IF NOT EXISTS Users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    phone_number VARCHAR(20),
    barangay VARCHAR(100),
    role ENUM('citizen', 'field_officer', 'dispatch_officer', 'system_admin') NOT NULL DEFAULT 'citizen',
    is_active BOOLEAN DEFAULT TRUE,
    profile_picture_url VARCHAR(255) DEFAULT NULL,
    failed_login_attempts INT DEFAULT 0,
    locked_until DATETIME DEFAULT NULL,
    reset_token VARCHAR(255) DEFAULT NULL,
    reset_token_expires DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. FIELD_OFFICERS (Extends Users - operational field data)
-- ============================================================
CREATE TABLE IF NOT EXISTS Field_officers (
    officer_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    badge_number VARCHAR(20) UNIQUE NOT NULL,
    assigned_barangay VARCHAR(100),
    is_available ENUM('available', 'busy', 'offline') DEFAULT 'offline',
    current_latitude DECIMAL(10, 8),
    current_longitude DECIMAL(11, 8),
    gps_last_updated DATETIME DEFAULT NULL,
    efficiency_score DECIMAL(5, 2) DEFAULT 100.00,
    total_resolved INT DEFAULT 0,
    on_time_arrival_rate DECIMAL(5, 2) DEFAULT 100.00,
    average_user_rating DECIMAL(3, 2) DEFAULT 5.00,
    avg_response_time DECIMAL(8, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- ============================================================
-- 3. DISPATCH_OFFICERS (Extends Users - validation workload)
-- ============================================================
CREATE TABLE IF NOT EXISTS Dispatch_officers (
    dispatch_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    badge_number VARCHAR(20) UNIQUE NOT NULL,
    assigned_barangay VARCHAR(100),
    is_on_duty BOOLEAN DEFAULT FALSE,
    total_complaints_handled INT DEFAULT 0,
    total_validated INT DEFAULT 0,
    total_rejected INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- ============================================================
-- 4. SYSTEM_ADMINISTRATORS (Extends Users - config & access)
-- ============================================================
CREATE TABLE IF NOT EXISTS System_administrators (
    admin_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    employee_id VARCHAR(20) UNIQUE NOT NULL,
    access_level ENUM('super_admin', 'system_admin') DEFAULT 'system_admin',
    last_login_at DATETIME DEFAULT NULL,
    config_permissions JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- ============================================================
-- 5. SYSTEM_CONFIGURATION
-- ============================================================
CREATE TABLE IF NOT EXISTS system_configuration (
    config_id INT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value VARCHAR(255) NOT NULL,
    config_description TEXT,
    last_updated_by INT,
    last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (last_updated_by) REFERENCES System_administrators(admin_id)
);

-- ============================================================
-- 6. COMPLAINT_CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS complaint_categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(100) UNIQUE NOT NULL,
    category_description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 7. COMPLAINTS (Primary transactional entity)
-- ============================================================
CREATE TABLE IF NOT EXISTS Complaints (
    complaint_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    tracking_id VARCHAR(50) UNIQUE NOT NULL,
    dispatch_id INT,
    category VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    incident_datetime DATETIME,
    address VARCHAR(255),
    asset_town VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    status ENUM('submitted', 'verified', 'assigned', 'in_progress', 'resolved', 'closed', 'rejected', 'cancelled') DEFAULT 'submitted',
    is_anonymous BOOLEAN DEFAULT FALSE,
    rejected_by INT DEFAULT NULL,
    rejection_reason TEXT DEFAULT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_soft_deleted BOOLEAN DEFAULT FALSE,
    deleted_at DATETIME DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (dispatch_id) REFERENCES Dispatch_officers(dispatch_id) ON DELETE SET NULL,
    FOREIGN KEY (rejected_by) REFERENCES Dispatch_officers(dispatch_id) ON DELETE SET NULL
);

-- ============================================================
-- 8. DUPLICATE_COMPLAINT_DETECTION
-- ============================================================
CREATE TABLE IF NOT EXISTS duplicate_complaint_detection (
    duplicate_id INT AUTO_INCREMENT PRIMARY KEY,
    primary_complaint_id INT,
    duplicate_complaint_id INT,
    distance_meters DECIMAL(8, 2),
    time_difference_hours INT,
    detection_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (primary_complaint_id) REFERENCES Complaints(complaint_id) ON DELETE CASCADE,
    FOREIGN KEY (duplicate_complaint_id) REFERENCES Complaints(complaint_id) ON DELETE CASCADE,
    UNIQUE(primary_complaint_id, duplicate_complaint_id)
);

-- ============================================================
-- 9. STATUS_HISTORY (Chronological audit trail of complaint transitions)
-- ============================================================
CREATE TABLE IF NOT EXISTS Status_history (
    history_id INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id INT NOT NULL,
    changed_by INT,
    status VARCHAR(50) NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (complaint_id) REFERENCES Complaints(complaint_id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES Users(user_id) ON DELETE SET NULL,
    INDEX (complaint_id, changed_at)
);

-- ============================================================
-- 10. MEDIA (Photo/video evidence with EXIF metadata)
-- ============================================================
CREATE TABLE IF NOT EXISTS Media (
    media_id INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id INT NOT NULL,
    file_url VARCHAR(255) NOT NULL,
    file_type ENUM('photo', 'video') DEFAULT 'photo',
    evidence_stage ENUM('initial_submission', 'before_proof', 'after_proof') DEFAULT 'initial_submission',
    exif_latitude DECIMAL(10, 8),
    exif_longitude DECIMAL(11, 8),
    exif_timestamp DATETIME,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by_role ENUM('citizen', 'officer') DEFAULT 'citizen',
    FOREIGN KEY (complaint_id) REFERENCES Complaints(complaint_id) ON DELETE CASCADE,
    INDEX (complaint_id, evidence_stage)
);

-- ============================================================
-- 11. ASSIGNMENTS (Deployment - links Complaints to Field_officers and Dispatch_officers)
-- ============================================================
CREATE TABLE IF NOT EXISTS Assignments (
    assignment_id INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id INT NOT NULL,
    field_officer_id INT NOT NULL,
    dispatch_id INT,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    response_deadline DATETIME NOT NULL,
    arrived_at DATETIME DEFAULT NULL,
    completed_at DATETIME DEFAULT NULL,
    is_current BOOLEAN DEFAULT TRUE,
    has_checked_in BOOLEAN DEFAULT FALSE,
    checkin_latitude DECIMAL(10, 8),
    checkin_longitude DECIMAL(11, 8),
    failure_alert_sent BOOLEAN DEFAULT FALSE,
    failure_alert_sent_at DATETIME DEFAULT NULL,
    reassigned_to INT DEFAULT NULL,
    reassignment_reason TEXT,
    reassignment_at DATETIME DEFAULT NULL,
    assignment_status ENUM('pending', 'in_progress', 'completed', 'failed', 'reassigned') DEFAULT 'pending',
    FOREIGN KEY (complaint_id) REFERENCES Complaints(complaint_id) ON DELETE CASCADE,
    FOREIGN KEY (field_officer_id) REFERENCES Field_officers(officer_id),
    FOREIGN KEY (dispatch_id) REFERENCES Dispatch_officers(dispatch_id),
    FOREIGN KEY (reassigned_to) REFERENCES Field_officers(officer_id),
    INDEX (complaint_id, assignment_status)
);

-- ============================================================
-- 12. RESOLUTION_REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS resolution_reports (
    report_id INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id INT NOT NULL,
    assignment_id INT NOT NULL,
    officer_id INT NOT NULL,
    resolution_description TEXT NOT NULL,
    before_photo_url VARCHAR(255),
    after_photo_url VARCHAR(255),
    before_photo_exif_lat DECIMAL(10, 8),
    before_photo_exif_lon DECIMAL(11, 8),
    before_photo_exif_time DATETIME,
    after_photo_exif_lat DECIMAL(10, 8),
    after_photo_exif_lon DECIMAL(11, 8),
    after_photo_exif_time DATETIME,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    dispatch_approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    dispatch_feedback TEXT,
    dispatch_reviewed_by INT,
    dispatch_review_timestamp DATETIME DEFAULT NULL,
    FOREIGN KEY (complaint_id) REFERENCES Complaints(complaint_id) ON DELETE CASCADE,
    FOREIGN KEY (assignment_id) REFERENCES Assignments(assignment_id),
    FOREIGN KEY (officer_id) REFERENCES Field_officers(officer_id),
    FOREIGN KEY (dispatch_reviewed_by) REFERENCES Dispatch_officers(dispatch_id),
    UNIQUE(complaint_id)
);

-- ============================================================
-- 13. RATINGS (Service evaluations - user feedback and officer performance)
-- ============================================================
CREATE TABLE IF NOT EXISTS Ratings (
    rating_id INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id INT NOT NULL,
    user_id INT,
    field_officer_id INT,
    score INT NOT NULL CHECK (score BETWEEN 1 AND 5),
    comments TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (complaint_id) REFERENCES Complaints(complaint_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (field_officer_id) REFERENCES Field_officers(officer_id) ON DELETE SET NULL,
    UNIQUE(complaint_id, user_id)
);

-- ============================================================
-- 14. NOTIFICATIONS (Real-time alerts delivered to users)
-- ============================================================
CREATE TABLE IF NOT EXISTS Notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id INT,
    user_id INT,
    recipient_role ENUM('citizen', 'field_officer', 'dispatch_officer', 'system_admin') NOT NULL,
    notification_type VARCHAR(100) NOT NULL,
    notification_title VARCHAR(100),
    message TEXT,
    notification_data JSON,
    is_read BOOLEAN DEFAULT FALSE,
    read_at DATETIME DEFAULT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME DEFAULT NULL,
    FOREIGN KEY (complaint_id) REFERENCES Complaints(complaint_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    INDEX (user_id, recipient_role, is_read)
);

-- ============================================================
-- 15. PASSWORD_RESET_TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    reset_token VARCHAR(255) UNIQUE NOT NULL,
    token_expiry DATETIME NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    used_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- ============================================================
-- 16. AUDIT_LOGS (Immutable ledger - Data Privacy Act compliance)
-- ============================================================
CREATE TABLE IF NOT EXISTS Audit_logs (
    log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id VARCHAR(100),
    action_details TEXT,
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    action_status ENUM('success', 'failed') DEFAULT 'success',
    datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE SET NULL,
    INDEX (user_id, datetime),
    INDEX (entity_type, entity_id, datetime)
);

-- ============================================================
-- 17. ACCOUNT_UNLOCK_HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS account_unlock_history (
    unlock_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    locked_reason TEXT,
    unlocked_by_admin_id INT,
    unlock_reason TEXT,
    unlock_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (unlocked_by_admin_id) REFERENCES System_administrators(admin_id)
);

-- ============================================================
-- 18. DELETED_RECORDS_LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS deleted_records_log (
    deletion_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    deleted_by_admin_id INT NOT NULL,
    record_type VARCHAR(100) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    deletion_type ENUM('soft_delete', 'permanent_purge') NOT NULL,
    deletion_reason TEXT,
    record_snapshot JSON,
    deletion_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deleted_by_admin_id) REFERENCES System_administrators(admin_id),
    INDEX (record_type, deletion_timestamp)
);

-- ============================================================
-- 19. PERFORMANCE_METRICS_CACHE
-- ============================================================
CREATE TABLE IF NOT EXISTS performance_metrics_cache (
    metric_id INT AUTO_INCREMENT PRIMARY KEY,
    metric_type VARCHAR(100) NOT NULL,
    metric_date DATE NOT NULL,
    officer_id INT,
    barangay VARCHAR(100),
    metric_value DECIMAL(10, 2),
    data_refresh_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (officer_id) REFERENCES Field_officers(officer_id),
    UNIQUE(metric_type, metric_date, officer_id, barangay)
);

-- ============================================================
-- 20. SEED DATA
-- ============================================================

-- Users (all roles in single table)
INSERT IGNORE INTO Users (username, email, password_hash, full_name, phone_number, barangay, role, is_active) VALUES
('rikka',        'rikka@gmail.com',         'Password123', 'Rikka Test',        '+639123456789', 'Commonwealth',  'citizen',          TRUE),
('rosette',      'rosette@gmail.com',        'Password123', 'Rosette Test',      '+639987654321', 'Batasan Hills', 'citizen',          TRUE),
('marcos',       'marcos@gmail.com',         'Password123', 'Marcos Test',       '+639112233445', 'Makati',        'citizen',          TRUE),
('fae',          'fae@trapico.gov',          'Password123', 'Fae Admin',         '+639111222333', 'Commonwealth',  'dispatch_officer', TRUE),
('dispatch2',    'dispatcher@trapico.gov',   'DispatchPass456', 'Officer Dispatcher', '+639222333444', 'BGC',      'dispatch_officer', TRUE),
('maria_admin',  'admin@trapico.gov',        'AdminPass123','Maria Admin',       '+639333444555', 'Commonwealth',  'system_admin',     TRUE),
('cien',         'cien@trapico.gov',         'Password123', 'Officer Rivera',    '+639123456799', 'Commonwealth',  'field_officer',    TRUE),
('javier',       'javier.d@trapico.gov',     'FieldPass2',  'Officer Javier',    '+639234567890', 'BGC',           'field_officer',    TRUE),
('cruz',         'cruz.a@trapico.gov',       'FieldPass3',  'Officer Cruz',      '+639345678901', 'Makati',        'field_officer',    TRUE);

-- Field_officers (extend Users for field officers: user_id 7, 8, 9)
INSERT IGNORE INTO Field_officers (user_id, badge_number, assigned_barangay, is_available, current_latitude, current_longitude) VALUES
(7, 'EMP-2024-0032', 'Commonwealth', 'available', 14.6760, 121.0437),
(8, 'EMP-2024-0033', 'BGC',          'offline',   14.5994, 121.0423),
(9, 'EMP-2024-0034', 'Makati',       'busy',      14.5631, 121.0203);

-- Dispatch_officers (extend Users for dispatch officers: user_id 4, 5)
INSERT IGNORE INTO Dispatch_officers (user_id, badge_number, assigned_barangay, is_on_duty) VALUES
(4, 'DISP-2024-0001', 'Commonwealth', TRUE),
(5, 'DISP-2024-0002', 'BGC',          TRUE);

-- System_administrators (extend Users for admin: user_id 6)
INSERT IGNORE INTO System_administrators (user_id, employee_id, access_level) VALUES
(6, 'ADM-2024-0001', 'system_admin');

-- System Configuration
INSERT IGNORE INTO system_configuration (config_key, config_value, config_description, last_updated_by) VALUES
('GEOFENCE_RADIUS_METERS',          '150',  'Radius for field officer geofence check-in',         1),
('RESPONSE_TIME_LIMIT_MINUTES',     '30',   'Maximum response time for field officers',            1),
('DUPLICATE_DETECTION_RADIUS_METERS','100', 'Radius for duplicate complaint detection',            1),
('DUPLICATE_DETECTION_TIME_HOURS',  '24',   'Time window for duplicate complaint detection',       1),
('ARRIVAL_WINDOW_MINUTES',          '30',   'Arrival window for field officer arrival countdown',  1);

-- Complaint Categories
INSERT IGNORE INTO complaint_categories (category_name, category_description, is_active) VALUES
('Traffic Obstruction',      'Vehicle blocking intersection or road',          TRUE),
('Illegal Parking',          'Vehicle parked illegally',                        TRUE),
('Abandoned Vehicle',        'Unattended vehicle causing obstruction',          TRUE),
('Traffic Signal Malfunction','Traffic light or sensor not working',            TRUE),
('Road Hazard',              'Debris, potholes, or safety hazard on road',      TRUE),
('Accident/Collision',       'Traffic accident with vehicles involved',         TRUE),
('Public Transport Issue',   'Bus, jeepney, or taxi violation',                 TRUE),
('Noise Violation',          'Excessive noise from vehicles',                   TRUE);

-- Complaints (user_id: 1=rikka, 2=rosette, 3=marcos; dispatch_id: 1=fae)
INSERT IGNORE INTO Complaints (user_id, tracking_id, dispatch_id, category, description, incident_datetime, address, asset_town, latitude, longitude, priority, status, is_anonymous) VALUES
(1, 'TRAPICO-2026-03-000016', 1, 'Traffic Obstruction', 'Large truck blocking intersection at Commonwealth Ave', NOW(), 'Commonwealth Ave, QC', 'Commonwealth', 14.6760, 121.0437, 'urgent',  'verified',    FALSE),
(2, 'TRAPICO-2026-03-000017', 1, 'Illegal Parking',     'Blue sedan parked illegally near Makati Avenue',       NOW(), 'Makati Avenue, Makati', 'BGC',          14.5994, 121.0423, 'high',    'assigned',    FALSE),
(3, 'TRAPICO-2026-03-000018', 1, 'Road Hazard',         'Large pothole on Gil Puyat Avenue',                    NOW(), 'Gil Puyat Ave, Makati', 'Makati',       14.5631, 121.0203, 'medium',  'in_progress', TRUE);

-- Status_history
INSERT IGNORE INTO Status_history (complaint_id, changed_by, status, notes) VALUES
(1, 1, 'submitted',    'Complaint received by system'),
(1, 4, 'verified',     'Complaint validated by Dispatcher - Fae Admin'),
(2, 2, 'submitted',    'Complaint received by system'),
(2, 4, 'verified',     'Complaint validated by Dispatcher'),
(2, 4, 'assigned',     'Assigned to Officer Rivera - 30 min window started'),
(3, 3, 'submitted',    'Complaint submitted anonymously'),
(3, 4, 'verified',     'Complaint validated by Dispatcher'),
(3, 4, 'assigned',     'Assigned to Officer Javier'),
(3, 4, 'in_progress',  'Officer Javier checked in via geofence');

-- Assignments (complaint_id→field_officer_id: 1→Rivera(1), 2→Rivera(1), 3→Javier(2))
INSERT IGNORE INTO Assignments (complaint_id, field_officer_id, dispatch_id, response_deadline, has_checked_in, assignment_status) VALUES
(1, 1, 1, DATE_ADD(NOW(), INTERVAL 30 MINUTE), FALSE, 'pending'),
(2, 1, 1, DATE_ADD(NOW(), INTERVAL 30 MINUTE), FALSE, 'pending'),
(3, 2, 1, DATE_ADD(NOW(), INTERVAL 30 MINUTE), TRUE,  'in_progress');

-- Media
INSERT IGNORE INTO Media (complaint_id, file_url, file_type, evidence_stage, uploaded_by_role) VALUES
(1, 'uploads/complaints/TRAPICO-2026-03-000016/photo1.jpg', 'photo', 'initial_submission', 'citizen'),
(2, 'uploads/complaints/TRAPICO-2026-03-000017/photo1.jpg', 'photo', 'initial_submission', 'citizen'),
(3, 'uploads/complaints/TRAPICO-2026-03-000018/photo1.jpg', 'photo', 'initial_submission', 'citizen');

-- Notifications (user_id: citizen=1, officer=7 for Rivera)
INSERT IGNORE INTO Notifications (complaint_id, user_id, recipient_role, notification_type, notification_title, message, is_read) VALUES
(1, 1, 'citizen',       'complaint_verified', 'Complaint Verified', 'Your complaint has been verified and assigned to a field officer.', TRUE),
(1, 7, 'field_officer', 'officer_assigned',   'New Assignment',     'You have been assigned to handle a traffic complaint.',            FALSE),
(3, 3, 'citizen',       'complaint_resolved', 'Complaint Resolved', 'Thank you! Your complaint has been resolved.',                    FALSE);

-- Password Reset Token (example)
INSERT IGNORE INTO password_reset_tokens (user_id, reset_token, token_expiry, is_used) VALUES
(1, 'abc123def456ghi789', DATE_ADD(NOW(), INTERVAL 24 HOUR), FALSE);

-- Audit_logs
INSERT IGNORE INTO Audit_logs (user_id, action, entity_type, entity_id, action_details, action_status) VALUES
(6, 'complaint_verified', 'complaint', 'TRAPICO-2026-03-000016', 'Complaint verified after duplicate check',        'success'),
(6, 'officer_assigned',   'assignment','TRAPICO-2026-03-000016', 'Officer Rivera assigned to complaint',            'success'),
(7, 'geofence_checkin',   'geofence',  'TRAPICO-2026-03-000018', 'Officer checked in at complaint location',        'success'),
(6, 'user_created',       'user',      '2',                      'New citizen account created',                     'success');

