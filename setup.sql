
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

/*!40000 DROP DATABASE IF EXISTS `trapico`*/;

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `trapico` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `trapico`;
DROP TABLE IF EXISTS `account_unlock_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `account_unlock_history` (
  `unlock_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `locked_reason` text DEFAULT NULL,
  `unlocked_by_admin_id` int(11) DEFAULT NULL,
  `unlock_reason` text DEFAULT NULL,
  `unlock_timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`unlock_id`),
  KEY `user_id` (`user_id`),
  KEY `unlocked_by_admin_id` (`unlocked_by_admin_id`),
  CONSTRAINT `account_unlock_history_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `account_unlock_history_ibfk_2` FOREIGN KEY (`unlocked_by_admin_id`) REFERENCES `system_administrators` (`admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `account_unlock_history` WRITE;
/*!40000 ALTER TABLE `account_unlock_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `account_unlock_history` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `assignments` (
  `assignment_id` int(11) NOT NULL AUTO_INCREMENT,
  `complaint_id` int(11) NOT NULL,
  `field_officer_id` int(11) NOT NULL,
  `dispatch_id` int(11) DEFAULT NULL,
  `assigned_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `response_deadline` datetime NOT NULL,
  `arrived_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `is_current` tinyint(1) DEFAULT 1,
  `has_checked_in` tinyint(1) DEFAULT 0,
  `checkin_latitude` decimal(10,8) DEFAULT NULL,
  `checkin_longitude` decimal(11,8) DEFAULT NULL,
  `failure_alert_sent` tinyint(1) DEFAULT 0,
  `failure_alert_sent_at` datetime DEFAULT NULL,
  `reassigned_to` int(11) DEFAULT NULL,
  `reassignment_reason` text DEFAULT NULL,
  `reassignment_at` datetime DEFAULT NULL,
  `assignment_status` enum('pending','in_progress','completed','failed','reassigned') DEFAULT 'pending',
  PRIMARY KEY (`assignment_id`),
  KEY `field_officer_id` (`field_officer_id`),
  KEY `dispatch_id` (`dispatch_id`),
  KEY `reassigned_to` (`reassigned_to`),
  KEY `complaint_id` (`complaint_id`,`assignment_status`),
  CONSTRAINT `assignments_ibfk_1` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE CASCADE,
  CONSTRAINT `assignments_ibfk_2` FOREIGN KEY (`field_officer_id`) REFERENCES `field_officers` (`officer_id`),
  CONSTRAINT `assignments_ibfk_3` FOREIGN KEY (`dispatch_id`) REFERENCES `dispatch_officers` (`dispatch_id`),
  CONSTRAINT `assignments_ibfk_4` FOREIGN KEY (`reassigned_to`) REFERENCES `field_officers` (`officer_id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `assignments` WRITE;
/*!40000 ALTER TABLE `assignments` DISABLE KEYS */;
INSERT INTO `assignments` VALUES (1,9,3,1,'2026-05-07 09:56:35','2026-05-07 12:26:35','2026-05-07 19:25:29',NULL,1,1,NULL,NULL,0,NULL,NULL,NULL,NULL,'completed'),(2,8,5,1,'2026-05-07 11:12:52','2026-05-07 13:42:52','2026-05-07 19:22:52',NULL,1,1,NULL,NULL,0,NULL,NULL,NULL,NULL,'completed'),(3,10,5,1,'2026-05-07 11:59:58','2026-05-07 14:29:58',NULL,NULL,1,0,NULL,NULL,0,NULL,NULL,NULL,NULL,'failed'),(4,7,1,3,'2026-05-07 12:09:55','2026-05-07 14:39:55',NULL,NULL,1,0,NULL,NULL,0,NULL,NULL,NULL,NULL,'failed'),(5,6,3,1,'2026-05-07 12:16:59','2026-05-07 14:46:59','2026-05-07 20:19:02',NULL,1,1,NULL,NULL,0,NULL,NULL,NULL,NULL,'completed'),(6,5,3,1,'2026-05-07 12:46:01','2026-05-07 15:16:01','2026-05-07 21:12:39',NULL,1,1,NULL,NULL,0,NULL,NULL,NULL,NULL,'failed'),(7,4,1,1,'2026-05-07 16:57:33','2026-05-07 19:27:33',NULL,NULL,1,0,NULL,NULL,0,NULL,NULL,NULL,NULL,'failed'),(8,11,5,1,'2026-05-07 16:58:47','2026-05-07 19:28:47',NULL,NULL,1,0,NULL,NULL,0,NULL,NULL,NULL,NULL,'failed'),(9,13,5,1,'2026-05-07 22:53:43','2026-05-08 01:23:43',NULL,NULL,1,0,NULL,NULL,0,NULL,NULL,NULL,NULL,'failed'),(10,14,3,1,'2026-05-07 23:20:42','2026-05-08 01:50:42','2026-05-08 07:32:24',NULL,1,1,NULL,NULL,0,NULL,NULL,NULL,NULL,'failed'),(11,18,9,5,'2026-05-08 02:15:30','2026-05-08 04:45:30',NULL,'2026-05-08 10:16:08',1,0,NULL,NULL,0,NULL,NULL,NULL,NULL,'completed'),(12,19,6,5,'2026-05-08 02:43:20','2026-05-08 05:13:20',NULL,'2026-05-08 10:44:51',1,0,NULL,NULL,0,NULL,NULL,NULL,NULL,'completed');
/*!40000 ALTER TABLE `assignments` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `audit_logs` (
  `log_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `entity_type` varchar(100) DEFAULT NULL,
  `entity_id` varchar(100) DEFAULT NULL,
  `action_details` text DEFAULT NULL,
  `old_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`old_values`)),
  `new_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`new_values`)),
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `action_status` enum('success','failed') DEFAULT 'success',
  `datetime` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`log_id`),
  KEY `user_id` (`user_id`,`datetime`),
  KEY `entity_type` (`entity_type`,`entity_id`,`datetime`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `chat_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `chat_messages` (
  `message_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `conversation_key` varchar(128) NOT NULL,
  `sender_role` varchar(32) NOT NULL,
  `sender_id` int(10) unsigned NOT NULL,
  `receiver_role` varchar(32) NOT NULL,
  `receiver_id` int(10) unsigned NOT NULL,
  `message_text` text NOT NULL,
  `sent_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`message_id`),
  KEY `idx_conversation` (`conversation_key`,`message_id`),
  KEY `idx_sender` (`sender_role`,`sender_id`),
  KEY `idx_receiver` (`receiver_role`,`receiver_id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `chat_messages` WRITE;
/*!40000 ALTER TABLE `chat_messages` DISABLE KEYS */;
INSERT INTO `chat_messages` VALUES (1,'dispatch:3|field:4','dispatch',3,'field',4,'Dispatch live test 1778155173576','2026-05-07 11:59:33'),(2,'dispatch:1|field:3','field',3,'dispatch',1,'Hello','2026-05-07 12:17:28'),(3,'dispatch:1|field:3','dispatch',1,'field',3,'hi','2026-05-07 12:20:44'),(4,'dispatch:1|field:5','dispatch',1,'field',5,'fgsgdrsfg','2026-05-07 15:00:51'),(5,'dispatch:1|field:3','field',3,'dispatch',1,'dg','2026-05-07 15:02:31'),(6,'dispatch:1|field:3','field',3,'dispatch',1,'sjxajxhs','2026-05-07 15:10:03'),(7,'dispatch:1|field:3','field',3,'dispatch',1,'JKSXKAHJXS','2026-05-07 15:10:18'),(8,'dispatch:1|field:2','dispatch',1,'field',2,'dgdfgdf','2026-05-07 16:55:52'),(9,'dispatch:1|field:3','field',3,'dispatch',1,'its not klhdla','2026-05-07 23:21:23'),(10,'dispatch:1|field:3','dispatch',1,'field',3,'kabfkuagfiaf','2026-05-07 23:21:56'),(11,'dispatch:1|field:3','field',3,'dispatch',1,'jadagdiuadgia d','2026-05-07 23:25:44'),(12,'dispatch:1|field:3','dispatch',1,'field',3,'hdjagdaugdiuadg','2026-05-07 23:25:54'),(13,'dispatch:1|field:3','dispatch',1,'field',3,'vajajfgiagfa','2026-05-07 23:26:07'),(14,'dispatch:1|field:3','dispatch',1,'field',3,'girlllllll','2026-05-07 23:26:29'),(15,'dispatch:1|field:3','dispatch',1,'field',3,'hjiahiah','2026-05-07 23:27:57'),(16,'dispatch:1|field:3','field',3,'dispatch',1,'hi po','2026-05-07 23:28:44'),(17,'dispatch:1|field:3','dispatch',1,'field',3,'hi din','2026-05-07 23:28:52'),(18,'dispatch:1|field:3','dispatch',1,'field',3,'hu oiiiiiiii','2026-05-07 23:31:51'),(19,'dispatch:1|field:3','field',3,'dispatch',1,'hsidaogdoagd','2026-05-07 23:39:38'),(20,'dispatch:1|field:3','field',3,'dispatch',1,'hi girpppp','2026-05-07 23:40:11'),(21,'dispatch:1|field:5','dispatch',1,'field',5,'Hello','2026-05-07 23:40:26');
/*!40000 ALTER TABLE `chat_messages` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `complaint_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `complaint_categories` (
  `category_id` int(11) NOT NULL AUTO_INCREMENT,
  `category_name` varchar(100) NOT NULL,
  `category_description` text DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `category_name` (`category_name`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `complaint_categories` WRITE;
/*!40000 ALTER TABLE `complaint_categories` DISABLE KEYS */;
INSERT INTO `complaint_categories` VALUES (1,'Traffic Obstruction','Vehicle blocking intersection or road',1,'2026-05-07 04:52:22'),(2,'Illegal Parking','Vehicle parked illegally',1,'2026-05-07 04:52:22'),(3,'Abandoned Vehicle','Unattended vehicle causing obstruction',1,'2026-05-07 04:52:22'),(4,'Traffic Signal Malfunction','Traffic light or sensor not working',1,'2026-05-07 04:52:22'),(5,'Road Hazard','Debris, potholes, or safety hazard on road',1,'2026-05-07 04:52:22'),(6,'Accident/Collision','Traffic accident with vehicles involved',1,'2026-05-07 04:52:22'),(7,'Public Transport Issue','Bus, jeepney, or taxi violation',1,'2026-05-07 04:52:22'),(8,'Noise Violation','Excessive noise from vehicles',1,'2026-05-07 04:52:22');
/*!40000 ALTER TABLE `complaint_categories` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `complaints`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `complaints` (
  `complaint_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `tracking_id` varchar(50) NOT NULL,
  `dispatch_id` int(11) DEFAULT NULL,
  `category` varchar(100) NOT NULL,
  `description` text NOT NULL,
  `incident_datetime` datetime DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `asset_town` varchar(100) NOT NULL,
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `priority` enum('low','medium','high','urgent') DEFAULT 'medium',
  `status` enum('submitted','verified','assigned','in_progress','resolved','closed','rejected','cancelled') DEFAULT 'submitted',
  `is_anonymous` tinyint(1) DEFAULT 0,
  `rejected_by` int(11) DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `submitted_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `is_soft_deleted` tinyint(1) DEFAULT 0,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`complaint_id`),
  UNIQUE KEY `tracking_id` (`tracking_id`),
  KEY `user_id` (`user_id`),
  KEY `dispatch_id` (`dispatch_id`),
  KEY `rejected_by` (`rejected_by`),
  CONSTRAINT `complaints_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `complaints_ibfk_2` FOREIGN KEY (`dispatch_id`) REFERENCES `dispatch_officers` (`dispatch_id`) ON DELETE SET NULL,
  CONSTRAINT `complaints_ibfk_3` FOREIGN KEY (`rejected_by`) REFERENCES `dispatch_officers` (`dispatch_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `complaints` WRITE;
/*!40000 ALTER TABLE `complaints` DISABLE KEYS */;
INSERT INTO `complaints` VALUES (1,1,'TRAPICO-2026-03-000016',1,'Traffic Obstruction','Large truck blocking intersection at Commonwealth Ave','2026-05-07 12:52:24','Commonwealth Ave, QC','Commonwealth',14.67600000,121.04370000,'low','verified',0,NULL,NULL,'2026-05-07 04:52:24','2026-05-07 17:12:18',0,NULL),(2,2,'TRAPICO-2026-03-000017',1,'Illegal Parking','Blue sedan parked illegally near Makati Avenue','2026-05-07 12:52:24','Makati Avenue, Makati','BGC',14.59940000,121.04230000,'high','assigned',0,NULL,NULL,'2026-05-07 04:52:24','2026-05-07 04:52:24',0,NULL),(3,3,'TRAPICO-2026-03-000018',1,'Road Hazard','Large pothole on Gil Puyat Avenue','2026-05-07 12:52:24','Gil Puyat Ave, Makati','Makati',14.56310000,121.02030000,'medium','in_progress',1,NULL,NULL,'2026-05-07 04:52:24','2026-05-07 04:52:24',0,NULL),(4,15,'TRAPICO-2026-05-000001',1,'Illegal Parking','mmljklnklnlknknkncfxgxfs thjdd rjyuyfifjhfgdgcguu fdh','2026-05-07 10:32:00',NULL,'Batasan Hills',14.69150000,121.05070000,'medium','assigned',0,NULL,NULL,'2026-05-07 07:51:17','2026-05-07 16:57:33',0,NULL),(5,15,'TRAPICO-2026-05-000002',1,'Illegal Parking','mmljklnklnlknknkncfxgxfs thjdd rjyuyfifjhfgdgcguu fdh','2026-05-07 10:32:00',NULL,'Batasan Hills',14.69150000,121.05070000,'medium','in_progress',1,NULL,NULL,'2026-05-07 07:51:31','2026-05-07 13:12:39',0,NULL),(6,16,'TRAPICO-2026-05-000003',1,'Illegal Parking','Vehicles are illegally parked on both lanes during rush hour, causing severe congestion and blocking emergency vehicles from passing through the area.','2026-05-07 10:30:00','123 Main Street','Commonwealth',14.67609877,121.04367256,'medium','resolved',0,NULL,NULL,'2026-05-07 08:24:53','2026-05-07 12:45:12',0,NULL),(7,16,'TRAPICO-2026-05-000004',3,'Traffic Obstruction','jgoae jgahejpehjrs pjypsjyrpsjyjpsry rpysprjypsyprypjspjr','2026-05-07 10:30:00','9 Latundan','Batasan Hills',14.67861042,121.02049828,'urgent','assigned',0,NULL,NULL,'2026-05-07 08:26:29','2026-05-07 12:09:55',0,NULL),(8,16,'TRAPICO-2026-05-000005',1,'Illegal Parking','fshfsg aga grrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr','2026-05-07 10:30:00','commonwealth ave','Commonwealth',14.67600000,121.04370000,'urgent','resolved',0,NULL,NULL,'2026-05-07 09:11:08','2026-05-07 11:23:22',0,NULL),(9,16,'TRAPICO-2026-05-000006',1,'Illegal Parking','LHOHKJHKJHKLHKHKHKH LHHHHHHHHHHHHHHHHHHHHHHHHH LHHHHHHHHHHHHHHHHHH L','2026-05-07 10:30:00','commonwealth ave','Commonwealth',14.67600000,121.04370000,'medium','resolved',0,NULL,NULL,'2026-05-07 09:45:30','2026-05-07 12:08:22',0,NULL),(10,1,'TRAPICO-2026-05-000007',1,'Illegal Parking','FKJAGKRJGK;AGJ ;AG EGJE;GJ;EGJEJ;GJE ;AGJEJGE;JGJE','2026-05-07 10:30:00','commonwealth ave','Commonwealth',14.67600000,121.04370000,'urgent','assigned',0,NULL,NULL,'2026-05-07 11:59:00','2026-05-07 11:59:58',0,NULL),(11,1,'TRAPICO-2026-05-000008',1,'Road Damage','vdzdcbfxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxgbcgvfbdbazdavvvvvvvvvvvvvvvvvvvvvvvsgggggggggggggggggggggggggggggggg','2026-05-07 10:30:00','commonwealth ave','Commonwealth',14.67600000,121.04370000,'medium','assigned',0,NULL,NULL,'2026-05-07 16:56:40','2026-05-07 16:58:47',0,NULL),(12,18,'TRAPICO-2026-05-000009',1,'Road Damage','uigsuagsdua gfoaha gaochaso gafha hapgpa pahd adhpad spdhpa','2024-01-23 16:26:34','Session Road, Talanay, 2nd District','Batasan Hills',14.68147290,121.10041300,'medium','rejected',0,NULL,NULL,'2026-05-07 22:42:34','2026-05-07 23:12:05',0,NULL),(13,18,'TRAPICO-2026-05-000010',1,'Traffic Obstruction','bsdfbdjhos hdshfsdfh ohksbfs hogkhd sidho dshodhoshfoshf s','2026-05-07 23:46:50','Commonwealth Avenue, Commonwealth, 2nd District','Commonwealth',14.70024820,121.08755230,'urgent','assigned',0,NULL,NULL,'2026-05-07 22:49:18','2026-05-07 22:53:43',0,NULL),(14,18,'TRAPICO-2026-05-000011',1,'Traffic Obstruction','kjbkjasbfahfa gifhasf yihfao yoafha gfgoaih afyaofh f','2024-01-23 16:26:34','Latundan Street, Talanay, 2nd District','Batasan Hills',14.68270130,121.10052550,'high','in_progress',0,NULL,NULL,'2026-05-07 23:20:21','2026-05-07 23:32:24',0,NULL),(15,19,'TRAPICO-2026-05-000012',NULL,'Illegal Parking','JGG TGGGG RUGE tia dfafda fua fa fgi gsdig wgdigd egd ie','2026-05-07 23:46:50','Talanay, 2nd District','Batasan Hills',14.68096380,121.09656840,'low','submitted',0,NULL,NULL,'2026-05-07 23:35:58','2026-05-07 23:35:58',0,NULL),(16,1,'TRAPICO-2026-05-000013',NULL,'Traffic Obstruction','fa\'kgegeakg ;agke;g e;a g;gkea;gke;g ;egke;ag ea;gk;eag','2024-01-23 16:26:57','Quezon City','Batasan Hills',14.73847333,121.49002074,'medium','submitted',0,NULL,NULL,'2026-05-08 02:00:06','2026-05-08 02:00:06',0,NULL),(17,1,'TRAPICO-2026-05-000014',NULL,'Traffic Obstruction','JFK;AGE G;EAGJGKJLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL','2024-01-23 16:26:34','Commonwealth, 2nd District','Commonwealth',14.69360970,121.07389700,'medium','submitted',0,NULL,NULL,'2026-05-08 02:06:36','2026-05-08 02:06:36',0,NULL),(18,1,'TRAPICO-2026-05-000015',5,'Traffic Obstruction','hiiiiiiiiiiiiiiiiiiiiiiiiiii hiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii','2024-01-22 06:49:40','Commonwealth, 2nd District','Commonwealth',14.69360970,121.07389700,'high','closed',0,NULL,NULL,'2026-05-08 02:10:53','2026-05-08 02:22:02',0,NULL),(19,1,'TRAPICO-2026-05-000016',5,'Signal Malfunction','wfstewtgdffgdyutdhesrtsgxdfyfusdfswrgsfghhjjkjkkkkkkkkkftydgsezcdsf','2023-09-26 03:37:04','Talanay, 2nd District','Batasan Hills',14.68096380,121.09656840,'high','closed',0,NULL,NULL,'2026-05-08 02:42:36','2026-05-08 02:48:27',0,NULL);
/*!40000 ALTER TABLE `complaints` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `deleted_records_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `deleted_records_log` (
  `deletion_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `deleted_by_admin_id` int(11) NOT NULL,
  `record_type` varchar(100) NOT NULL,
  `record_id` varchar(100) NOT NULL,
  `deletion_type` enum('soft_delete','permanent_purge') NOT NULL,
  `deletion_reason` text DEFAULT NULL,
  `record_snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`record_snapshot`)),
  `deletion_timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`deletion_id`),
  KEY `deleted_by_admin_id` (`deleted_by_admin_id`),
  KEY `record_type` (`record_type`,`deletion_timestamp`),
  CONSTRAINT `deleted_records_log_ibfk_1` FOREIGN KEY (`deleted_by_admin_id`) REFERENCES `system_administrators` (`admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `deleted_records_log` WRITE;
/*!40000 ALTER TABLE `deleted_records_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `deleted_records_log` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `dispatch_officers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `dispatch_officers` (
  `dispatch_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `badge_number` varchar(20) NOT NULL,
  `assigned_barangay` varchar(100) DEFAULT NULL,
  `is_on_duty` tinyint(1) DEFAULT 0,
  `total_complaints_handled` int(11) DEFAULT 0,
  `total_validated` int(11) DEFAULT 0,
  `total_rejected` int(11) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`dispatch_id`),
  UNIQUE KEY `user_id` (`user_id`),
  UNIQUE KEY `badge_number` (`badge_number`),
  CONSTRAINT `dispatch_officers_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `dispatch_officers` WRITE;
/*!40000 ALTER TABLE `dispatch_officers` DISABLE KEYS */;
INSERT INTO `dispatch_officers` VALUES (1,4,'DISP-2024-0001','Commonwealth',1,0,0,0,'2026-05-07 04:52:15','2026-05-07 04:52:15'),(2,5,'DISP-2024-0002','BGC',1,0,0,0,'2026-05-07 04:52:15','2026-05-07 04:52:15'),(3,13,'DISP-2026-0013','Commonwealth',0,0,0,0,'2026-05-07 05:35:21','2026-05-07 05:35:21'),(4,24,'DISP-2026-0024','Commonwealth',0,0,0,0,'2026-05-08 00:51:11','2026-05-08 00:51:11'),(5,26,'DISP-2026-0026','Commonwealth',0,0,0,0,'2026-05-08 01:03:34','2026-05-08 01:03:34');
/*!40000 ALTER TABLE `dispatch_officers` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `duplicate_complaint_detection`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `duplicate_complaint_detection` (
  `duplicate_id` int(11) NOT NULL AUTO_INCREMENT,
  `primary_complaint_id` int(11) DEFAULT NULL,
  `duplicate_complaint_id` int(11) DEFAULT NULL,
  `distance_meters` decimal(8,2) DEFAULT NULL,
  `time_difference_hours` int(11) DEFAULT NULL,
  `detection_timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`duplicate_id`),
  UNIQUE KEY `primary_complaint_id` (`primary_complaint_id`,`duplicate_complaint_id`),
  KEY `duplicate_complaint_id` (`duplicate_complaint_id`),
  CONSTRAINT `duplicate_complaint_detection_ibfk_1` FOREIGN KEY (`primary_complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE CASCADE,
  CONSTRAINT `duplicate_complaint_detection_ibfk_2` FOREIGN KEY (`duplicate_complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `duplicate_complaint_detection` WRITE;
/*!40000 ALTER TABLE `duplicate_complaint_detection` DISABLE KEYS */;
INSERT INTO `duplicate_complaint_detection` VALUES (1,5,4,0.00,0,'2026-05-07 07:51:31'),(2,6,1,11.37,0,'2026-05-07 08:24:53'),(3,8,1,0.00,0,'2026-05-07 09:11:09'),(4,8,6,11.37,0,'2026-05-07 09:11:09'),(5,9,1,0.00,0,'2026-05-07 09:45:30'),(6,9,6,11.37,0,'2026-05-07 09:45:30'),(7,9,8,0.00,0,'2026-05-07 09:45:30'),(8,10,1,0.00,0,'2026-05-07 11:59:00'),(9,10,6,11.37,0,'2026-05-07 11:59:00'),(10,10,8,0.00,0,'2026-05-07 11:59:00'),(11,10,9,0.00,0,'2026-05-07 11:59:00'),(12,11,1,0.00,0,'2026-05-07 16:56:40'),(13,11,6,11.37,0,'2026-05-07 16:56:40'),(14,11,8,0.00,0,'2026-05-07 16:56:40'),(15,11,9,0.00,0,'2026-05-07 16:56:40'),(16,11,10,0.00,0,'2026-05-07 16:56:40'),(17,18,17,0.00,0,'2026-05-08 02:10:53'),(18,19,15,0.00,0,'2026-05-08 02:42:36');
/*!40000 ALTER TABLE `duplicate_complaint_detection` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `field_officers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `field_officers` (
  `officer_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `badge_number` varchar(20) NOT NULL,
  `assigned_barangay` varchar(100) DEFAULT NULL,
  `is_available` enum('available','busy','offline') DEFAULT 'offline',
  `current_latitude` decimal(10,8) DEFAULT NULL,
  `current_longitude` decimal(11,8) DEFAULT NULL,
  `gps_last_updated` datetime DEFAULT NULL,
  `efficiency_score` decimal(5,2) DEFAULT 100.00,
  `total_resolved` int(11) DEFAULT 0,
  `on_time_arrival_rate` decimal(5,2) DEFAULT 100.00,
  `average_user_rating` decimal(3,2) DEFAULT 5.00,
  `avg_response_time` decimal(8,2) DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`officer_id`),
  UNIQUE KEY `user_id` (`user_id`),
  UNIQUE KEY `badge_number` (`badge_number`),
  CONSTRAINT `field_officers_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `field_officers` WRITE;
/*!40000 ALTER TABLE `field_officers` DISABLE KEYS */;
INSERT INTO `field_officers` VALUES (1,7,'EMP-2024-0032','Commonwealth','available',14.67600000,121.04370000,NULL,100.00,0,100.00,5.00,0.00,'2026-05-07 04:52:13','2026-05-07 22:52:41'),(2,8,'EMP-2024-0033','BGC','offline',14.59940000,121.04230000,NULL,100.00,0,100.00,5.00,0.00,'2026-05-07 04:52:13','2026-05-07 04:52:13'),(3,9,'EMP-2024-0034','Makati','available',14.56310000,121.02030000,NULL,100.00,0,100.00,5.00,0.00,'2026-05-07 04:52:13','2026-05-08 02:21:15'),(4,14,'field_test_133521','Batasan Hills','offline',NULL,NULL,NULL,100.00,0,100.00,5.00,0.00,'2026-05-07 05:35:22','2026-05-07 05:35:22'),(5,17,'OFF-001','Commonwealth','available',14.67600000,121.04370000,NULL,100.00,0,100.00,5.00,0.00,'2026-05-07 11:11:48','2026-05-08 01:54:15'),(6,22,'QC-1023','Commonwealth','available',NULL,NULL,NULL,100.00,1,100.00,5.00,0.00,'2026-05-08 00:18:34','2026-05-08 02:48:27'),(9,28,'QC-0124','Central','available',NULL,NULL,NULL,100.00,1,100.00,5.00,0.00,'2026-05-08 01:43:30','2026-05-08 02:22:02');
/*!40000 ALTER TABLE `field_officers` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `media`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `media` (
  `media_id` int(11) NOT NULL AUTO_INCREMENT,
  `complaint_id` int(11) NOT NULL,
  `file_url` varchar(255) NOT NULL,
  `file_type` enum('photo','video') DEFAULT 'photo',
  `evidence_stage` enum('initial_submission','before_proof','after_proof') DEFAULT 'initial_submission',
  `exif_latitude` decimal(10,8) DEFAULT NULL,
  `exif_longitude` decimal(11,8) DEFAULT NULL,
  `exif_timestamp` datetime DEFAULT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `uploaded_by_role` enum('citizen','officer') DEFAULT 'citizen',
  PRIMARY KEY (`media_id`),
  KEY `complaint_id` (`complaint_id`,`evidence_stage`),
  CONSTRAINT `media_ibfk_1` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `media` WRITE;
/*!40000 ALTER TABLE `media` DISABLE KEYS */;
INSERT INTO `media` VALUES (1,6,'../uploads/complaint_69fc4c4f8b76e.jpg','photo','initial_submission',NULL,NULL,NULL,'2026-05-07 08:24:53','citizen'),(2,12,'../uploads/complaint_69fd154a5a639.png','photo','initial_submission',NULL,NULL,NULL,'2026-05-07 22:42:34','citizen'),(3,13,'../uploads/complaint_69fd16cf4de4f.png','photo','initial_submission',NULL,NULL,NULL,'2026-05-07 22:49:18','citizen'),(4,13,'../uploads/complaint_69fd16db74eba.png','photo','initial_submission',NULL,NULL,NULL,'2026-05-07 22:49:18','citizen'),(5,13,'../uploads/complaint_69fd16ebb1ce3.png','photo','initial_submission',NULL,NULL,NULL,'2026-05-07 22:49:18','citizen'),(6,14,'../uploads/complaint_69fd1e2eb4ee7.png','photo','initial_submission',NULL,NULL,NULL,'2026-05-07 23:20:21','citizen'),(7,15,'../uploads/complaint_69fd21db32dc7.png','photo','initial_submission',NULL,NULL,NULL,'2026-05-07 23:35:58','citizen'),(8,16,'../uploads/complaint_69fd439ee10ce.png','photo','initial_submission',NULL,NULL,NULL,'2026-05-08 02:00:06','citizen'),(9,17,'../uploads/complaint_69fd4529b71e1.png','photo','initial_submission',NULL,NULL,NULL,'2026-05-08 02:06:36','citizen'),(10,18,'../uploads/complaint_69fd462a2dfae.png','photo','initial_submission',NULL,NULL,NULL,'2026-05-08 02:10:53','citizen'),(11,19,'../uploads/complaint_69fd4d98ca9e3.png','photo','initial_submission',NULL,NULL,NULL,'2026-05-08 02:42:36','citizen');
/*!40000 ALTER TABLE `media` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notifications` (
  `notification_id` int(11) NOT NULL AUTO_INCREMENT,
  `complaint_id` int(11) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `recipient_role` enum('citizen','field_officer','dispatch_officer','system_admin') NOT NULL,
  `notification_type` varchar(100) NOT NULL,
  `notification_title` varchar(100) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `notification_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`notification_data`)),
  `is_read` tinyint(1) DEFAULT 0,
  `read_at` datetime DEFAULT NULL,
  `changed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `expires_at` datetime DEFAULT NULL,
  PRIMARY KEY (`notification_id`),
  KEY `complaint_id` (`complaint_id`),
  KEY `user_id` (`user_id`,`recipient_role`,`is_read`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE CASCADE,
  CONSTRAINT `notifications_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `password_reset_tokens` (
  `token_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `reset_token` varchar(255) NOT NULL,
  `token_expiry` datetime NOT NULL,
  `is_used` tinyint(1) DEFAULT 0,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`token_id`),
  UNIQUE KEY `reset_token` (`reset_token`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `password_reset_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `password_reset_tokens` WRITE;
/*!40000 ALTER TABLE `password_reset_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `password_reset_tokens` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `performance_metrics_cache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `performance_metrics_cache` (
  `metric_id` int(11) NOT NULL AUTO_INCREMENT,
  `metric_type` varchar(100) NOT NULL,
  `metric_date` date NOT NULL,
  `officer_id` int(11) DEFAULT NULL,
  `barangay` varchar(100) DEFAULT NULL,
  `metric_value` decimal(10,2) DEFAULT NULL,
  `data_refresh_timestamp` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`metric_id`),
  UNIQUE KEY `metric_type` (`metric_type`,`metric_date`,`officer_id`,`barangay`),
  KEY `officer_id` (`officer_id`),
  CONSTRAINT `performance_metrics_cache_ibfk_1` FOREIGN KEY (`officer_id`) REFERENCES `field_officers` (`officer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `performance_metrics_cache` WRITE;
/*!40000 ALTER TABLE `performance_metrics_cache` DISABLE KEYS */;
/*!40000 ALTER TABLE `performance_metrics_cache` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `ratings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ratings` (
  `rating_id` int(11) NOT NULL AUTO_INCREMENT,
  `complaint_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `field_officer_id` int(11) DEFAULT NULL,
  `score` int(11) NOT NULL CHECK (`score` between 1 and 5),
  `comments` text DEFAULT NULL,
  `submitted_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`rating_id`),
  UNIQUE KEY `complaint_id` (`complaint_id`,`user_id`),
  KEY `user_id` (`user_id`),
  KEY `field_officer_id` (`field_officer_id`),
  CONSTRAINT `ratings_ibfk_1` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE CASCADE,
  CONSTRAINT `ratings_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `ratings_ibfk_3` FOREIGN KEY (`field_officer_id`) REFERENCES `field_officers` (`officer_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `ratings` WRITE;
/*!40000 ALTER TABLE `ratings` DISABLE KEYS */;
INSERT INTO `ratings` VALUES (1,19,1,6,5,'','2026-05-08 02:49:01');
/*!40000 ALTER TABLE `ratings` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `resolution_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `resolution_reports` (
  `report_id` int(11) NOT NULL AUTO_INCREMENT,
  `complaint_id` int(11) NOT NULL,
  `assignment_id` int(11) NOT NULL,
  `officer_id` int(11) NOT NULL,
  `resolution_description` text NOT NULL,
  `before_photo_url` varchar(255) DEFAULT NULL,
  `after_photo_url` varchar(255) DEFAULT NULL,
  `before_photo_exif_lat` decimal(10,8) DEFAULT NULL,
  `before_photo_exif_lon` decimal(11,8) DEFAULT NULL,
  `before_photo_exif_time` datetime DEFAULT NULL,
  `after_photo_exif_lat` decimal(10,8) DEFAULT NULL,
  `after_photo_exif_lon` decimal(11,8) DEFAULT NULL,
  `after_photo_exif_time` datetime DEFAULT NULL,
  `submitted_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `dispatch_approval_status` enum('pending','approved','rejected') DEFAULT 'pending',
  `dispatch_feedback` text DEFAULT NULL,
  `dispatch_reviewed_by` int(11) DEFAULT NULL,
  `dispatch_review_timestamp` datetime DEFAULT NULL,
  PRIMARY KEY (`report_id`),
  UNIQUE KEY `complaint_id` (`complaint_id`),
  KEY `assignment_id` (`assignment_id`),
  KEY `officer_id` (`officer_id`),
  KEY `dispatch_reviewed_by` (`dispatch_reviewed_by`),
  CONSTRAINT `resolution_reports_ibfk_1` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE CASCADE,
  CONSTRAINT `resolution_reports_ibfk_2` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`assignment_id`),
  CONSTRAINT `resolution_reports_ibfk_3` FOREIGN KEY (`officer_id`) REFERENCES `field_officers` (`officer_id`),
  CONSTRAINT `resolution_reports_ibfk_4` FOREIGN KEY (`dispatch_reviewed_by`) REFERENCES `dispatch_officers` (`dispatch_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `resolution_reports` WRITE;
/*!40000 ALTER TABLE `resolution_reports` DISABLE KEYS */;
INSERT INTO `resolution_reports` VALUES (1,8,2,5,'Method: Obstruction removal\n\nDescription: Cleared illegally parked vehicles and reopened lane.\n\nEquipment Used: Traffic cones','','',NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-07 11:23:22','pending',NULL,NULL,NULL),(2,9,1,3,'Method: Traffic re-routing\n\nDescription: jklge gegreregregrgerge\n\nEquipment Used: Car\n\nFollow-Up Recommendations: jngeonge','../uploads/complaint_69fc80a42fbda.png','../uploads/complaint_69fc80a81d8b5.png',NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-07 12:08:22','pending',NULL,NULL,NULL),(3,6,5,3,'Method: Obstruction removal\n\nDescription: GEGE HEHEH HHALFJE LAJGELGE JGLDAGJDLGAE\n\nEquipment Used: Car\n\nFollow-Up Recommendations: GDLAGJEG;EA','../uploads/complaint_69fc894128d70.png','../uploads/complaint_69fc8943d1b07.png',NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-07 12:45:12','pending',NULL,NULL,NULL),(4,18,11,9,'Method: Obstruction removal\n\nDescription: kjglfsgkjf ;fjg;rhr;hjr;sjr;sj;srr','../uploads/complaint_69fd475935133.png','../uploads/complaint_69fd475d75a25.png',NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-08 02:16:08','approved','faege',5,'2026-05-08 10:22:02'),(5,19,12,6,'Method: Obstruction removal\n\nDescription: gfgdfefxf\n\nFollow-Up Recommendations: fregfdgf','../uploads/complaint_69fd4df520faa.png','../uploads/complaint_69fd4e173bece.png',NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-08 02:44:51','approved','',5,'2026-05-08 10:48:27');
/*!40000 ALTER TABLE `resolution_reports` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `status_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `status_history` (
  `history_id` int(11) NOT NULL AUTO_INCREMENT,
  `complaint_id` int(11) NOT NULL,
  `changed_by` int(11) DEFAULT NULL,
  `status` varchar(50) NOT NULL,
  `changed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `notes` text DEFAULT NULL,
  PRIMARY KEY (`history_id`),
  KEY `changed_by` (`changed_by`),
  KEY `complaint_id` (`complaint_id`,`changed_at`),
  CONSTRAINT `status_history_ibfk_1` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE CASCADE,
  CONSTRAINT `status_history_ibfk_2` FOREIGN KEY (`changed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=56 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `status_history` WRITE;
/*!40000 ALTER TABLE `status_history` DISABLE KEYS */;
INSERT INTO `status_history` VALUES (1,1,1,'submitted','2026-05-07 04:52:29','Complaint received by system'),(2,1,4,'verified','2026-05-07 04:52:29','Complaint validated by Dispatcher - Fae Admin'),(3,2,2,'submitted','2026-05-07 04:52:29','Complaint received by system'),(4,2,4,'verified','2026-05-07 04:52:29','Complaint validated by Dispatcher'),(5,2,4,'assigned','2026-05-07 04:52:29','Assigned to Officer Rivera - 30 min window started'),(6,3,3,'submitted','2026-05-07 04:52:29','Complaint submitted anonymously'),(7,3,4,'verified','2026-05-07 04:52:29','Complaint validated by Dispatcher'),(8,3,4,'assigned','2026-05-07 04:52:29','Assigned to Officer Javier'),(9,3,4,'in_progress','2026-05-07 04:52:29','Officer Javier checked in via geofence'),(10,4,15,'submitted','2026-05-07 07:51:17','Complaint submitted by user.'),(11,5,15,'submitted','2026-05-07 07:51:31','Complaint submitted by user.'),(12,6,16,'submitted','2026-05-07 08:24:53','Complaint submitted by user.'),(13,7,16,'submitted','2026-05-07 08:26:29','Complaint submitted by user.'),(14,8,16,'submitted','2026-05-07 09:11:08','Complaint submitted by user.'),(15,9,16,'submitted','2026-05-07 09:45:30','Complaint submitted by user.'),(16,9,4,'assigned','2026-05-07 09:56:35','Verified and assigned to officer ID 3'),(17,8,4,'assigned','2026-05-07 11:12:52','Verified and assigned to officer ID 5'),(18,8,17,'in_progress','2026-05-07 11:22:52','Field officer checked in within the geofence.'),(19,8,17,'resolved','2026-05-07 11:23:22','Field officer submitted resolution report.'),(20,9,9,'in_progress','2026-05-07 11:25:29','Field officer checked in within the geofence.'),(21,10,1,'submitted','2026-05-07 11:59:00','Complaint submitted by user.'),(22,10,4,'assigned','2026-05-07 11:59:58','Verified and assigned to officer ID 5'),(23,9,9,'resolved','2026-05-07 12:08:22','Field officer submitted resolution report.'),(24,7,13,'assigned','2026-05-07 12:09:55','Verified and assigned to officer ID 1'),(25,6,4,'assigned','2026-05-07 12:16:59','Verified and assigned to officer ID 3'),(26,6,9,'in_progress','2026-05-07 12:19:02','Field officer checked in within the geofence.'),(27,6,9,'resolved','2026-05-07 12:45:12','Field officer submitted resolution report.'),(28,5,4,'assigned','2026-05-07 12:46:01','Verified and assigned to officer ID 3'),(29,5,9,'in_progress','2026-05-07 13:12:39','Field officer checked in within the geofence.'),(30,11,1,'submitted','2026-05-07 16:56:40','Complaint submitted by user.'),(31,4,4,'assigned','2026-05-07 16:57:33','Verified and assigned to officer ID 1'),(32,11,4,'assigned','2026-05-07 16:58:47','Verified and assigned to officer ID 5'),(33,1,4,'verified','2026-05-07 17:09:01','Priority level updated to MEDIUM by dispatch.'),(34,1,4,'verified','2026-05-07 17:12:18','Priority level updated to LOW by dispatch.'),(35,12,18,'submitted','2026-05-07 22:42:34','Complaint submitted by user.'),(36,13,18,'submitted','2026-05-07 22:49:18','Complaint submitted by user.'),(37,13,4,'assigned','2026-05-07 22:53:43','Verified and assigned to officer ID 5'),(38,12,4,'rejected','2026-05-07 23:12:05','hjsfusfos fsgfsf afgaafboagfouagd'),(39,14,18,'submitted','2026-05-07 23:20:21','Complaint submitted by user.'),(40,14,4,'assigned','2026-05-07 23:20:42','Verified and assigned to officer ID 3'),(41,14,9,'in_progress','2026-05-07 23:32:24','Field officer checked in within the geofence.'),(42,14,9,'in_progress','2026-05-07 23:32:24','Field officer updated complaint status from Field module.'),(43,15,19,'submitted','2026-05-07 23:35:58','Complaint submitted by user.'),(44,16,1,'submitted','2026-05-08 02:00:06','Complaint submitted by user.'),(45,17,1,'submitted','2026-05-08 02:06:36','Complaint submitted by user.'),(46,18,1,'submitted','2026-05-08 02:10:53','Complaint submitted by user.'),(47,18,26,'assigned','2026-05-08 02:15:30','Verified and assigned to officer ID 9'),(48,18,28,'resolved','2026-05-08 02:16:08','Field officer submitted resolution report.'),(49,18,28,'resolved','2026-05-08 02:16:08','Field officer updated complaint status from Field module.'),(50,18,26,'closed','2026-05-08 02:22:02','Dispatch officer validated and closed the case.'),(51,19,1,'submitted','2026-05-08 02:42:36','Complaint submitted by user.'),(52,19,26,'assigned','2026-05-08 02:43:20','Verified and assigned to officer ID 6'),(53,19,22,'resolved','2026-05-08 02:44:51','Field officer submitted resolution report.'),(54,19,22,'resolved','2026-05-08 02:44:51','Field officer updated complaint status from Field module.'),(55,19,26,'closed','2026-05-08 02:48:27','Dispatch officer validated and closed the case.');
/*!40000 ALTER TABLE `status_history` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `system_administrators`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `system_administrators` (
  `admin_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `employee_id` varchar(20) NOT NULL,
  `access_level` enum('super_admin','system_admin') DEFAULT 'system_admin',
  `last_login_at` datetime DEFAULT NULL,
  `config_permissions` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`config_permissions`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`admin_id`),
  UNIQUE KEY `user_id` (`user_id`),
  UNIQUE KEY `employee_id` (`employee_id`),
  CONSTRAINT `system_administrators_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `system_administrators` WRITE;
/*!40000 ALTER TABLE `system_administrators` DISABLE KEYS */;
INSERT INTO `system_administrators` VALUES (1,6,'ADM-2024-0001','system_admin',NULL,NULL,'2026-05-07 04:52:19','2026-05-07 04:52:19');
/*!40000 ALTER TABLE `system_administrators` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `system_configuration`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `system_configuration` (
  `config_id` int(11) NOT NULL AUTO_INCREMENT,
  `config_key` varchar(100) NOT NULL,
  `config_value` varchar(255) NOT NULL,
  `config_description` text DEFAULT NULL,
  `last_updated_by` int(11) DEFAULT NULL,
  `last_updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`config_id`),
  UNIQUE KEY `config_key` (`config_key`),
  KEY `last_updated_by` (`last_updated_by`),
  CONSTRAINT `system_configuration_ibfk_1` FOREIGN KEY (`last_updated_by`) REFERENCES `system_administrators` (`admin_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `system_configuration` WRITE;
/*!40000 ALTER TABLE `system_configuration` DISABLE KEYS */;
INSERT INTO `system_configuration` VALUES (1,'GEOFENCE_RADIUS_METERS','150','Radius for field officer geofence check-in',1,'2026-05-07 04:52:20'),(2,'RESPONSE_TIME_LIMIT_MINUTES','30','Maximum response time for field officers',1,'2026-05-07 04:52:20'),(3,'DUPLICATE_DETECTION_RADIUS_METERS','100','Radius for duplicate complaint detection',1,'2026-05-07 04:52:20'),(4,'DUPLICATE_DETECTION_TIME_HOURS','24','Time window for duplicate complaint detection',1,'2026-05-07 04:52:20'),(5,'ARRIVAL_WINDOW_MINUTES','30','Arrival window for field officer arrival countdown',1,'2026-05-07 04:52:20');
/*!40000 ALTER TABLE `system_configuration` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `user_id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `full_name` varchar(100) DEFAULT NULL,
  `phone_number` varchar(20) DEFAULT NULL,
  `barangay` varchar(100) DEFAULT NULL,
  `role` enum('citizen','field_officer','dispatch_officer','system_admin') NOT NULL DEFAULT 'citizen',
  `is_active` tinyint(1) DEFAULT 1,
  `profile_picture_url` varchar(255) DEFAULT NULL,
  `failed_login_attempts` int(11) DEFAULT 0,
  `locked_until` datetime DEFAULT NULL,
  `reset_token` varchar(255) DEFAULT NULL,
  `reset_token_expires` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'rikka','rikka@gmail.com','Password123','Rikka Test','+639123456789','Commonwealth','citizen',1,NULL,0,NULL,NULL,NULL,'2026-05-07 04:52:09','2026-05-08 02:36:42'),(2,'rosette','rosette@gmail.com','Password123','Rosette Test','+639987654321','Batasan Hills','citizen',1,NULL,0,NULL,NULL,NULL,'2026-05-07 04:52:09','2026-05-07 04:52:09'),(3,'marcos','marcos@gmail.com','Password123','Marcos Test','+639112233445','Makati','citizen',1,NULL,0,NULL,NULL,NULL,'2026-05-07 04:52:09','2026-05-07 04:52:09'),(4,'fae','fae@trapico.gov','Password123','Fae Admin','+639111222333','Commonwealth','dispatch_officer',1,NULL,0,NULL,NULL,NULL,'2026-05-07 04:52:09','2026-05-07 23:17:42'),(5,'dispatch2','dispatcher@trapico.gov','DispatchPass456','Officer Dispatcher','+639222333444','BGC','dispatch_officer',1,NULL,0,NULL,NULL,NULL,'2026-05-07 04:52:09','2026-05-07 04:52:09'),(6,'maria_admin','admin@trapico.gov','AdminPass123','Maria Admin','+639333444555','Commonwealth','system_admin',1,NULL,0,NULL,NULL,NULL,'2026-05-07 04:52:09','2026-05-07 04:52:09'),(7,'cien','cien@trapico.gov','$2y$10$YpHaK6RSkc3YABWnSt4dAeAGWn3lX1431SASCjhg62BsD.uAhjI8e','Officer Rivera','+639123456799','Commonwealth','field_officer',1,NULL,0,NULL,NULL,NULL,'2026-05-07 04:52:09','2026-05-07 16:53:15'),(8,'javier','javier.d@trapico.gov','FieldPass2','Officer Javier','+639234567890','BGC','field_officer',1,NULL,0,NULL,NULL,NULL,'2026-05-07 04:52:09','2026-05-07 04:52:09'),(9,'cruz','cruz.a@trapico.gov','FieldPass3','Officer Cruz','+639345678901','Makati','field_officer',1,NULL,0,NULL,NULL,NULL,'2026-05-07 04:52:09','2026-05-07 23:31:39'),(10,'testcitizen1','testcitizen1+regular@trapico.local','$2y$10$YzL6s5bzMLhZBV7wDHeZaOjtKc.7ExTENdaV2/aRgFLwjTxMmII6m','testcitizen1','09171234567','Commonwealth','citizen',1,NULL,0,NULL,NULL,NULL,'2026-05-07 05:26:52','2026-05-07 05:26:52'),(11,'testcitizen3','testcitizen3+regular@trapico.local','$2y$10$iQ/B7ILvCdbD4bNNYiFQeuYL13AHhB05bXXMaGxNdMGyZcxoD3iTe','testcitizen3','09171234569','Commonwealth','citizen',1,NULL,0,NULL,NULL,NULL,'2026-05-07 05:28:51','2026-05-07 05:29:55'),(12,'Ann21','ann21+regular@trapico.local','$2y$10$Mc2sMY54LNI7m86HF19nD.PDbOBvjt/kf8l5Hdgix8Hj9WnEgUHd6','Ann21','9815775222','Commonwealth','citizen',1,NULL,0,NULL,NULL,NULL,'2026-05-07 05:32:17','2026-05-07 05:32:52'),(13,'dispatch_test_133521','dispatch_test_133521+dispatch@trapico.local','$2y$10$GCKISXkSfimiz1vrKHCJK.kW0NOjpwee.gboIDWM7kbUjvlbS0R2m','dispatch_test_133521','09170001111','Commonwealth','dispatch_officer',1,NULL,0,NULL,NULL,NULL,'2026-05-07 05:35:21','2026-05-07 12:09:12'),(14,'field_test_133521','field_test_133521+field@trapico.local','$2y$10$dcyOpu/NyL.L4kaB4ffefurPcBYLV0BBgjDqombrIcNBzRBeE3e.C','field_test_133521','09170002222','Batasan Hills','field_officer',1,NULL,0,NULL,NULL,NULL,'2026-05-07 05:35:22','2026-05-07 12:10:33'),(15,'Annnicole','annnicole+regular@trapico.local','$2y$10$K2dM4mo/OtNvhBtdBtQQM.mLPMznJqQkK1m5kzQbGlfWitdTzAqii','Annnicole','98157758888','Batasan Hills','citizen',1,NULL,0,NULL,NULL,NULL,'2026-05-07 07:24:57','2026-05-07 07:47:47'),(16,'jdoe','jdoe@gmail.com','$2y$10$Pew7vf9/VMP0CcUXYYKoNedCrvWgB34OhFsNUCqXxzXkKqr5/OOs6','Juan D. Oe','+63 912 345 6789','Commonwealth','citizen',1,NULL,0,NULL,NULL,NULL,'2026-05-07 07:59:46','2026-05-07 09:44:40'),(17,'rreyes','rreyes@trapico.gov','Password123','Ofc. Ramon Reyes','+639170000002','Commonwealth','field_officer',1,NULL,0,NULL,NULL,NULL,'2026-05-07 11:11:48','2026-05-07 11:21:34'),(18,'Ann212','navilgascien@gmail.com','$2y$10$b6j6HrvIvMRXxse4OFPD3enm3RoBNLchnyHjWY46ViKyHvbLvGlGy','Ann Navlgas','9815775222','Batasan Hills','citizen',1,NULL,0,NULL,NULL,NULL,'2026-05-07 21:58:07','2026-05-08 00:49:24'),(19,'JC221','jhoncuevas@gmail.com','$2y$10$eeiQZh1T7Rsjn8keWKkhA.YryuQJKXu0IWg2JfmaXu1gqScRWssYC','John Cuevas','9815775222','Central','citizen',1,NULL,0,NULL,NULL,NULL,'2026-05-07 23:34:56','2026-05-07 23:44:17'),(20,'JC222','jhonycuevas@gmail.com','$2y$10$9oa7LmcMl9w7CyRSBvEEMuyeO1R3kRR1R854Niaeux4u4fRr1CRmO','Johny Cuevas','9815775227','Sto. Cristo','citizen',1,'../uploads/complaint_69fd280a0be38.png',0,NULL,NULL,NULL,'2026-05-07 23:48:14','2026-05-08 00:02:33'),(22,'Annie21','navilgasannie221@gmail.com','$2y$10$4YzwhUnx..iisjaQRjhZUOPNecAMZeHgNwOP4jT6C5kizLe4hAHPm','Annie Navlgas','09123456789','Commonwealth','field_officer',1,NULL,0,NULL,NULL,NULL,'2026-05-08 00:18:34','2026-05-08 02:40:39'),(23,'JC222222','navilgascien.1@gmail.com','$2y$10$zQvcam85IHGBFiF/9INYnuLpdULZbBmHUtuMFmkF1xZ4hiSAjoVx.','John Navlgas','09123456789','Commonwealth','citizen',1,NULL,0,NULL,NULL,NULL,'2026-05-08 00:39:57','2026-05-08 00:39:57'),(24,'Ann2122','ann2122+dispatch@trapico.local','$2y$10$7VUOf3xCpGhDa19ZyPckjeqKPp1TKg02BMQ6/mmnl/3J1xRAL7J/.','John Cuevas','09123456789','Commonwealth','dispatch_officer',1,NULL,0,NULL,NULL,NULL,'2026-05-08 00:51:11','2026-05-08 00:51:11'),(26,'nikky','nikkycartallas@gmail.com','$2y$10$uO9FrskLBANuYwHEOMDB4u9iJlxSYaI0UQlCWsz9ro8MbIKr34Um2','Ann Navlgas','9815775222','Commonwealth','dispatch_officer',1,NULL,0,NULL,NULL,NULL,'2026-05-08 01:03:34','2026-05-08 02:37:26'),(28,'Ann21FE','cartallaanny@gmail.com','$2y$10$l/ZCMkwNh5ETK57BhYlTJecdKF8dH.iCL3HZe/SPJDAXr1rNUdvdW','Johnygege Navlgass','09123456789','Central','field_officer',1,NULL,0,NULL,NULL,NULL,'2026-05-08 01:43:30','2026-05-08 02:40:31');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

