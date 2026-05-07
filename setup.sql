
DROP DATABASE IF EXISTS trapico;
CREATE DATABASE trapico CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE trapico;

-- 2. CITIZEN_ACCOUNTS (Civilian User Role)
-- Explicit name to distinguish from Officers/Dispatchers
CREATE TABLE citizen_accounts (
    citizen_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(100) UNIQUE NOT NULL,
    phone_number VARCHAR(20),
    home_barangay VARCHAR(100),
    profile_picture_url VARCHAR(255) DEFAULT NULL,
    account_status ENUM('active', 'suspended', 'deleted') DEFAULT 'active',
    account_lock_status BOOLEAN DEFAULT FALSE,    -- Account locked due to failed attempts
    failed_login_attempts INT DEFAULT 0,
    last_login_timestamp DATETIME DEFAULT NULL,
    account_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. DISPATCH_ADMIN_ACCOUNTS (Dispatch/Admin Role)
-- Used by signin_updispatch.html
CREATE TABLE dispatch_admin_accounts (
    admin_id INT AUTO_INCREMENT PRIMARY KEY,
    admin_full_name VARCHAR(100) NOT NULL,
    admin_email VARCHAR(100) UNIQUE NOT NULL,
    admin_password VARCHAR(255) NOT NULL,
    admin_role ENUM('dispatch_officer', 'system_admin') DEFAULT 'dispatch_officer',
    account_status ENUM('active', 'suspended', 'deleted') DEFAULT 'active',
    account_lock_status BOOLEAN DEFAULT FALSE,
    failed_login_attempts INT DEFAULT 0,
    last_login_timestamp DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 4. FIELD_OFFICER_ACCOUNTS (Officer Role)
-- Named specifically so you know this table handles the actual people in the field
CREATE TABLE field_officer_accounts (
    officer_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id_number VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    ui_initials VARCHAR(5),
    email_address VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    assigned_barangay_jurisdiction VARCHAR(100),
    current_duty_status ENUM('available', 'busy', 'offline') DEFAULT 'offline',
    gps_latitude DECIMAL(10, 8),
    gps_longitude DECIMAL(11, 8),
    gps_last_updated DATETIME DEFAULT NULL,
    total_cases_resolved INT DEFAULT 0,
    average_rating_from_citizens DECIMAL(3, 2) DEFAULT 5.00,
    total_response_minutes INT DEFAULT 0,
    total_failed_arrivals INT DEFAULT 0,
    account_status ENUM('active', 'suspended', 'deleted') DEFAULT 'active',
    account_lock_status BOOLEAN DEFAULT FALSE,
    failed_login_attempts INT DEFAULT 0,
    last_login_timestamp DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 5. SYSTEM_CONFIGURATION
-- System Admin configurable settings
CREATE TABLE system_configuration (
    config_id INT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value VARCHAR(255) NOT NULL,
    config_description TEXT,
    last_updated_by INT,                          -- admin_id who made the change
    last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (last_updated_by) REFERENCES dispatch_admin_accounts(admin_id)
);

-- 6. COMPLAINT_CATEGORIES
-- Manage complaint categories for system config
CREATE TABLE complaint_categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(100) UNIQUE NOT NULL,
    category_description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. TRAFFIC_COMPLAINTS_MASTER (The Core Data)
-- Detailed naming to show this is the primary record for every incident
CREATE TABLE traffic_complaints_master (
    tracking_number VARCHAR(50) PRIMARY KEY,
    citizen_reporter_id INT,
    verifying_dispatch_id INT,
    incident_category VARCHAR(100) NOT NULL,
    incident_barangay VARCHAR(100) NOT NULL,
    urgency_priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    current_progress_status ENUM('submitted', 'verified', 'assigned', 'in_progress', 'resolved', 'closed', 'rejected', 'cancelled') DEFAULT 'submitted',
    incident_description TEXT NOT NULL,
    is_reported_anonymously BOOLEAN DEFAULT FALSE,
    map_latitude DECIMAL(10, 8) NOT NULL,
    map_longitude DECIMAL(11, 8) NOT NULL,
    dispatch_rejection_note TEXT DEFAULT NULL,
    citizen_feedback_rating INT DEFAULT NULL,
    citizen_feedback_comment TEXT DEFAULT NULL,
    feedback_submitted_at DATETIME DEFAULT NULL,
    submission_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_soft_deleted BOOLEAN DEFAULT FALSE,       -- Soft delete flag
    deleted_at DATETIME DEFAULT NULL,
    FOREIGN KEY (citizen_reporter_id) REFERENCES citizen_accounts(citizen_id) ON DELETE SET NULL,
    FOREIGN KEY (verifying_dispatch_id) REFERENCES dispatch_admin_accounts(admin_id)
);

-- 8. DUPLICATE_COMPLAINT_DETECTION
-- Track duplicates (within 100m, 24 hours)
CREATE TABLE duplicate_complaint_detection (
    duplicate_id INT AUTO_INCREMENT PRIMARY KEY,
    primary_complaint_tracking_number VARCHAR(50),
    duplicate_complaint_tracking_number VARCHAR(50),
    distance_meters DECIMAL(8, 2),
    time_difference_hours INT,
    detection_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (primary_complaint_tracking_number) REFERENCES traffic_complaints_master(tracking_number) ON DELETE CASCADE,
    FOREIGN KEY (duplicate_complaint_tracking_number) REFERENCES traffic_complaints_master(tracking_number) ON DELETE CASCADE,
    UNIQUE(primary_complaint_tracking_number, duplicate_complaint_tracking_number)
);

-- 9. COMPLAINT_LIFECYCLE_TIMELINE
-- Stores every state change for the "8-Stage Transparency Timeline"
CREATE TABLE complaint_lifecycle_timeline (
    event_id INT AUTO_INCREMENT PRIMARY KEY,
    tracking_number VARCHAR(50) NOT NULL,
    status_reached VARCHAR(50) NOT NULL,
    status_remarks TEXT,
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tracking_number) REFERENCES traffic_complaints_master(tracking_number) ON DELETE CASCADE,
    INDEX (tracking_number, event_timestamp)
);

-- 10. COMPLAINT_EVIDENCE_MEDIA
-- Stores the array of photo URLs with EXIF data
CREATE TABLE complaint_evidence_media (
    media_id INT AUTO_INCREMENT PRIMARY KEY,
    tracking_number VARCHAR(50) NOT NULL,
    media_url VARCHAR(255) NOT NULL,
    media_type ENUM('photo', 'video') DEFAULT 'photo',
    evidence_stage ENUM('initial_submission', 'before_proof', 'after_proof') DEFAULT 'initial_submission',
    exif_latitude DECIMAL(10, 8),                 -- Auto-captured GPS
    exif_longitude DECIMAL(11, 8),                -- Auto-captured GPS
    exif_timestamp DATETIME,                      -- Auto-captured timestamp
    upload_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by_user_type ENUM('citizen', 'officer') DEFAULT 'citizen',
    FOREIGN KEY (tracking_number) REFERENCES traffic_complaints_master(tracking_number) ON DELETE CASCADE,
    INDEX (tracking_number, evidence_stage)
);

-- 11. OFFICER_JOB_ASSIGNMENTS
-- Matches field2.js logic: GPS Geofence and 30-minute Timer
CREATE TABLE officer_job_assignments (
    assignment_id INT AUTO_INCREMENT PRIMARY KEY,
    tracking_number VARCHAR(50) NOT NULL,
    assigned_officer_id INT NOT NULL,
    assignment_start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    response_deadline_timestamp DATETIME NOT NULL,
    has_officer_checked_in BOOLEAN DEFAULT FALSE,
    actual_arrival_time DATETIME DEFAULT NULL,
    officer_geofence_latitude DECIMAL(10, 8),     -- Officer's GPS when checked in
    officer_geofence_longitude DECIMAL(11, 8),    -- Officer's GPS when checked in
    failure_to_arrive_alert_sent BOOLEAN DEFAULT FALSE,
    failure_to_arrive_alert_sent_at DATETIME DEFAULT NULL,
    reassigned_to_new_officer_id INT DEFAULT NULL,
    reassignment_reason TEXT,
    reassignment_timestamp DATETIME DEFAULT NULL,
    assignment_status ENUM('pending', 'in_progress', 'completed', 'failed', 'reassigned') DEFAULT 'pending',
    FOREIGN KEY (tracking_number) REFERENCES traffic_complaints_master(tracking_number) ON DELETE CASCADE,
    FOREIGN KEY (assigned_officer_id) REFERENCES field_officer_accounts(officer_id),
    FOREIGN KEY (reassigned_to_new_officer_id) REFERENCES field_officer_accounts(officer_id),
    INDEX (tracking_number, assignment_status)
);

-- 12. RESOLUTION_REPORTS
-- Officer's resolution submission with before/after proof
CREATE TABLE resolution_reports (
    report_id INT AUTO_INCREMENT PRIMARY KEY,
    tracking_number VARCHAR(50) NOT NULL,
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
    FOREIGN KEY (tracking_number) REFERENCES traffic_complaints_master(tracking_number) ON DELETE CASCADE,
    FOREIGN KEY (assignment_id) REFERENCES officer_job_assignments(assignment_id),
    FOREIGN KEY (officer_id) REFERENCES field_officer_accounts(officer_id),
    FOREIGN KEY (dispatch_reviewed_by) REFERENCES dispatch_admin_accounts(admin_id),
    UNIQUE(tracking_number)
);

-- 13. REAL_TIME_NOTIFICATIONS
-- Socket.io based notifications for all user types
CREATE TABLE real_time_notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    recipient_user_type ENUM('citizen', 'officer', 'dispatcher', 'admin') NOT NULL,
    recipient_user_id INT,                        -- Links to citizen_id, officer_id, or admin_id
    tracking_number VARCHAR(50),
    notification_type ENUM('complaint_verified', 'officer_assigned', 'officer_on_route', 'officer_arrived', 'complaint_resolved', 'complaint_closed', 'complaint_rejected', 'service_rating_requested', 'failure_to_arrive_alert', 'reassignment_alert') NOT NULL,
    notification_title VARCHAR(100),
    notification_body TEXT,
    notification_data JSON,                       -- Extra data as JSON (office name, officer details, etc)
    is_read BOOLEAN DEFAULT FALSE,
    read_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME DEFAULT NULL,
    INDEX (recipient_user_type, recipient_user_id, is_read)
);

-- 14. PASSWORD_RESET_TOKENS
-- Manage password reset requests via email
CREATE TABLE password_reset_tokens (
    token_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    user_type ENUM('citizen', 'officer', 'admin') NOT NULL,
    reset_token VARCHAR(255) UNIQUE NOT NULL,
    token_expiry DATETIME NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    used_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. AUDIT_LOGS
-- System Admin audit trail for all actions
CREATE TABLE audit_logs (
    audit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    user_type ENUM('citizen', 'officer', 'dispatcher', 'admin') NOT NULL,
    action_type VARCHAR(100) NOT NULL,            -- e.g., 'user_created', 'complaint_verified', 'user_suspended'
    resource_type VARCHAR(100),                   -- e.g., 'user_account', 'complaint', 'system_config'
    resource_id VARCHAR(100),
    action_details TEXT,
    old_values JSON,                              -- For tracking what changed
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    action_status ENUM('success', 'failed') DEFAULT 'success',
    action_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (user_id, user_type, action_timestamp),
    INDEX (resource_type, resource_id, action_timestamp)
);

-- 16. ACCOUNT_UNLOCK_HISTORY
-- Track when accounts are unlocked by admins
CREATE TABLE account_unlock_history (
    unlock_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    user_type ENUM('citizen', 'officer', 'admin') NOT NULL,
    locked_reason TEXT,
    unlocked_by_admin_id INT,
    unlock_reason TEXT,
    unlock_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (unlocked_by_admin_id) REFERENCES dispatch_admin_accounts(admin_id)
);

-- 17. DELETED_RECORDS_LOG
-- Soft and hard delete tracking for compliance
CREATE TABLE deleted_records_log (
    deletion_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    deleted_by_admin_id INT NOT NULL,
    record_type VARCHAR(100) NOT NULL,            -- e.g., 'user_account', 'complaint'
    record_id VARCHAR(100) NOT NULL,
    deletion_type ENUM('soft_delete', 'permanent_purge') NOT NULL,
    deletion_reason TEXT,
    record_snapshot JSON,                         -- Store deleted data as backup
    deletion_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deleted_by_admin_id) REFERENCES dispatch_admin_accounts(admin_id),
    INDEX (record_type, deletion_timestamp)
);

-- 18. PERFORMANCE_METRICS_CACHE
-- Cached analytics for dashboard performance
CREATE TABLE performance_metrics_cache (
    metric_id INT AUTO_INCREMENT PRIMARY KEY,
    metric_type VARCHAR(100) NOT NULL,            -- e.g., 'avg_response_time', 'complaint_closure_rate'
    metric_date DATE NOT NULL,
    officer_id INT,
    barangay VARCHAR(100),
    metric_value DECIMAL(10, 2),
    data_refresh_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (officer_id) REFERENCES field_officer_accounts(officer_id),
    UNIQUE(metric_type, metric_date, officer_id, barangay)
);

-- 19. SEED DATA (Test data for immediate frontend preview)

-- Citizen Accounts
INSERT INTO citizen_accounts (username, password_hash, first_name, last_name, email, phone_number, home_barangay, account_status) 
VALUES 
('rikka', 'Password123', 'Rikka', 'Test', 'rikka@gmail.com', '+639123456789', 'Commonwealth', 'active'),
('rosette', 'Password123', 'Rosette', 'Test', 'rosette@gmail.com', '+639987654321', 'Batasan Hills', 'active');

-- Admin/Dispatch Accounts
INSERT INTO dispatch_admin_accounts (admin_full_name, admin_email, admin_password, admin_role, account_status)
VALUES 
('Maria Admin', 'admin@trapico.gov', 'AdminPass123', 'system_admin', 'active'),
('Officer Dispatcher', 'dispatcher@trapico.gov', 'DispatchPass456', 'dispatch_officer', 'active');

-- Field Officer Accounts
INSERT INTO field_officer_accounts (employee_id_number, full_name, ui_initials, email_address, password_hash, phone_number, current_duty_status, assigned_barangay_jurisdiction, account_status, gps_latitude, gps_longitude)
VALUES 
('EMP-2024-0032', 'Officer Rivera', 'OR', 'rivera@trapico.gov', 'FieldPass1', '+639123456799', 'available', 'Commonwealth', 'active', 14.6760, 121.0437),
('EMP-2024-0033', 'Officer Javier', 'JD', 'javier.d@trapico.gov', 'FieldPass2', '+639234567890', 'offline', 'BGC', 'active', 14.5994, 121.0423),
('EMP-2024-0034', 'Officer Cruz', 'CR', 'cruz.a@trapico.gov', 'FieldPass3', '+639345678901', 'busy', 'Makati', 'active', 14.5631, 121.0203);

-- System Configuration
INSERT INTO system_configuration (config_key, config_value, config_description, last_updated_by)
VALUES 
('GEOFENCE_RADIUS_METERS', '150', 'Radius for field officer geofence check-in', 1),
('RESPONSE_TIME_LIMIT_MINUTES', '30', 'Maximum response time for field officers', 1),
('DUPLICATE_DETECTION_RADIUS_METERS', '100', 'Radius for duplicate complaint detection', 1),
('DUPLICATE_DETECTION_TIME_HOURS', '24', 'Time window for duplicate complaint detection', 1),
('ARRIVAL_WINDOW_MINUTES', '30', 'Arrival window for field officer arrival countdown', 1);

-- Complaint Categories
INSERT INTO complaint_categories (category_name, category_description, is_active)
VALUES 
('Traffic Obstruction', 'Vehicle blocking intersection or road', TRUE),
('Illegal Parking', 'Vehicle parked illegally', TRUE),
('Abandoned Vehicle', 'Unattended vehicle causing obstruction', TRUE),
('Traffic Signal Malfunction', 'Traffic light or sensor not working', TRUE),
('Road Hazard', 'Debris, potholes, or safety hazard on road', TRUE),
('Accident/Collision', 'Traffic accident with vehicles involved', TRUE),
('Public Transport Issue', 'Bus, jeepney, or taxi violation', TRUE),
('Noise Violation', 'Excessive noise from vehicles', TRUE);

-- Traffic Complaints Master
INSERT INTO traffic_complaints_master (tracking_number, citizen_reporter_id, verifying_dispatch_id, incident_category, incident_barangay, urgency_priority, current_progress_status, incident_description, is_reported_anonymously, map_latitude, map_longitude)
VALUES 
('TRAPICO-2026-03-000016', 1, 1, 'Traffic Obstruction', 'Commonwealth', 'urgent', 'verified', 'Large truck blocking intersection at Commonwealth Ave', FALSE, 14.6760, 121.0437),
('TRAPICO-2026-03-000017', 2, 1, 'Illegal Parking', 'BGC', 'high', 'assigned', 'Blue sedan parked illegally near Makati Avenue', FALSE, 14.5994, 121.0423),
('TRAPICO-2026-03-000018', 3, 1, 'Road Hazard', 'Makati', 'medium', 'in_progress', 'Large pothole on Gil Puyat Avenue', TRUE, 14.5631, 121.0203);

-- Complaint Lifecycle Timeline
INSERT INTO complaint_lifecycle_timeline (tracking_number, status_reached, status_remarks)
VALUES 
('TRAPICO-2026-03-000016', 'submitted', 'Complaint received by system'),
('TRAPICO-2026-03-000016', 'verified', 'Complaint validated by Dispatcher - Maria Admin'),
('TRAPICO-2026-03-000017', 'submitted', 'Complaint received by system'),
('TRAPICO-2026-03-000017', 'verified', 'Complaint validated by Dispatcher'),
('TRAPICO-2026-03-000017', 'assigned', 'Assigned to Officer Rivera - 30 min window started'),
('TRAPICO-2026-03-000018', 'submitted', 'Complaint submitted anonymously'),
('TRAPICO-2026-03-000018', 'verified', 'Complaint validated by Dispatcher'),
('TRAPICO-2026-03-000018', 'assigned', 'Assigned to Officer Javier'),
('TRAPICO-2026-03-000018', 'in_progress', 'Officer Javier checked in via geofence');

-- Officer Job Assignments
INSERT INTO officer_job_assignments (tracking_number, assigned_officer_id, response_deadline_timestamp, has_officer_checked_in, assignment_status)
VALUES 
('TRAPICO-2026-03-000016', 1, DATE_ADD(NOW(), INTERVAL 30 MINUTE), FALSE, 'pending'),
('TRAPICO-2026-03-000017', 1, DATE_ADD(NOW(), INTERVAL 30 MINUTE), FALSE, 'pending'),
('TRAPICO-2026-03-000018', 2, DATE_ADD(NOW(), INTERVAL 30 MINUTE), TRUE, 'in_progress');

-- Complaint Evidence Media (Initial Submissions)
INSERT INTO complaint_evidence_media (tracking_number, media_url, media_type, evidence_stage, uploaded_by_user_type)
VALUES 
('TRAPICO-2026-03-000016', 'https://trapico-storage.s3.com/complaints/TRAPICO-2026-03-000016/photo1.jpg', 'photo', 'initial_submission', 'citizen'),
('TRAPICO-2026-03-000017', 'https://trapico-storage.s3.com/complaints/TRAPICO-2026-03-000017/photo1.jpg', 'photo', 'initial_submission', 'citizen'),
('TRAPICO-2026-03-000018', 'https://trapico-storage.s3.com/complaints/TRAPICO-2026-03-000018/photo1.jpg', 'photo', 'initial_submission', 'citizen');

-- Real-Time Notifications
INSERT INTO real_time_notifications (recipient_user_type, recipient_user_id, tracking_number, notification_type, notification_title, notification_body, is_read)
VALUES 
('citizen', 1, 'TRAPICO-2026-03-000016', 'complaint_verified', 'Complaint Verified', 'Your complaint has been verified and assigned to a field officer.', TRUE),
('officer', 1, 'TRAPICO-2026-03-000016', 'officer_assigned', 'New Assignment', 'You have been assigned to handle a traffic complaint.', FALSE),
('citizen', 3, 'TRAPICO-2026-03-000018', 'complaint_resolved', 'Complaint Resolved', 'Thank you! Your complaint has been resolved.', FALSE);

-- Password Reset Token (example)
INSERT INTO password_reset_tokens (user_id, user_type, reset_token, token_expiry, is_used)
VALUES 
(1, 'citizen', 'abc123def456ghi789', DATE_ADD(NOW(), INTERVAL 24 HOUR), FALSE);

-- Audit Logs
INSERT INTO audit_logs (user_id, user_type, action_type, resource_type, resource_id, action_details, action_status)
VALUES 
(1, 'admin', 'complaint_verified', 'complaint', 'TRAPICO-2026-03-000016', 'Complaint verified after duplicate check', 'success'),
(1, 'admin', 'officer_assigned', 'assignment', 'TRAPICO-2026-03-000016', 'Officer Rivera assigned to complaint', 'success'),
(2, 'officer', 'geofence_checkin', 'geofence', 'TRAPICO-2026-03-000018', 'Officer checked in at complaint location', 'success'),
(1, 'admin', 'user_created', 'user_account', '2', 'New citizen account created', 'success');