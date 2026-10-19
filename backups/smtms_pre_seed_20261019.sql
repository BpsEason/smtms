-- MySQL dump 10.13  Distrib 8.4.3, for Win64 (x86_64)
--
-- Host: localhost    Database: smtms
-- ------------------------------------------------------
-- Server version	8.4.3

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `alembic_version`
--

DROP TABLE IF EXISTS `alembic_version`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alembic_version` (
  `version_num` varchar(32) COLLATE utf8mb4_general_ci NOT NULL,
  PRIMARY KEY (`version_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `alembic_version`
--

LOCK TABLES `alembic_version` WRITE;
/*!40000 ALTER TABLE `alembic_version` DISABLE KEYS */;
INSERT INTO `alembic_version` VALUES ('20261019_comments_first_schema');
/*!40000 ALTER TABLE `alembic_version` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internal_material_lots`
--

DROP TABLE IF EXISTS `internal_material_lots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `internal_material_lots` (
  `id` int NOT NULL COMMENT '內部批次主鍵',
  `material_id` int NOT NULL COMMENT '原物料主鍵',
  `supplier_lot_id` int DEFAULT NULL COMMENT '來源供應商批次主鍵',
  `receipt_id` int DEFAULT NULL COMMENT '來源收料紀錄主鍵',
  `internal_lot_no` varchar(120) COLLATE utf8mb4_general_ci NOT NULL COMMENT '內部批號',
  `qty_on_hand` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '現有庫存量',
  `qty_reserved` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '預留庫存量',
  `uom` varchar(30) COLLATE utf8mb4_general_ci NOT NULL COMMENT '庫存計量單位',
  `lot_status` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'available' COMMENT '批次狀態',
  `expiry_date` datetime DEFAULT NULL COMMENT '批次有效日期',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_internal_material_lots_material_internal_lot` (`material_id`,`internal_lot_no`),
  KEY `ix_internal_material_lots_id` (`id`),
  KEY `ix_internal_material_lots_internal_lot_no` (`internal_lot_no`),
  KEY `ix_internal_material_lots_lot_status` (`lot_status`),
  KEY `ix_internal_material_lots_material_id` (`material_id`),
  KEY `ix_internal_material_lots_receipt_id` (`receipt_id`),
  KEY `ix_internal_material_lots_supplier_lot_id` (`supplier_lot_id`),
  CONSTRAINT `internal_material_lots_ibfk_1` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`),
  CONSTRAINT `internal_material_lots_ibfk_2` FOREIGN KEY (`supplier_lot_id`) REFERENCES `supplier_lots` (`id`),
  CONSTRAINT `internal_material_lots_ibfk_3` FOREIGN KEY (`receipt_id`) REFERENCES `material_receipts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='內部物料批次庫存';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internal_material_lots`
--

LOCK TABLES `internal_material_lots` WRITE;
/*!40000 ALTER TABLE `internal_material_lots` DISABLE KEYS */;
INSERT INTO `internal_material_lots` VALUES (1,1,1,1,'SEED-ILOT-001-1',50.0000,0.0000,'pcs','available','2027-09-14 09:30:00','2026-10-19 09:40:05'),(2,1,1,1,'SEED-ILOT-001-2',50.0000,0.0000,'pcs','available','2027-09-14 09:30:00','2026-10-19 09:40:05'),(3,2,2,2,'SEED-ILOT-002-1',0.0000,0.0000,'pcs','quarantine','2027-09-15 09:30:00','2026-10-19 09:40:05'),(4,2,2,2,'SEED-ILOT-002-2',0.0000,0.0000,'pcs','quarantine','2027-09-15 09:30:00','2026-10-19 09:40:05'),(5,3,3,3,'SEED-ILOT-003-1',0.0000,0.0000,'pcs','rejected','2027-09-16 09:30:00','2026-10-19 09:40:05'),(6,3,3,3,'SEED-ILOT-003-2',0.0000,0.0000,'pcs','rejected','2027-09-16 09:30:00','2026-10-19 09:40:05'),(7,4,4,4,'SEED-ILOT-004-1',65.0000,0.0000,'set','available','2027-09-17 09:30:00','2026-10-19 09:40:05'),(8,4,4,4,'SEED-ILOT-004-2',65.0000,0.0000,'set','available','2027-09-17 09:30:00','2026-10-19 09:40:05'),(9,5,5,5,'SEED-ILOT-005-1',70.0000,0.0000,'pcs','available','2027-09-18 09:30:00','2026-10-19 09:40:05'),(10,5,5,5,'SEED-ILOT-005-2',70.0000,0.0000,'pcs','available','2027-09-18 09:30:00','2026-10-19 09:40:05'),(11,6,6,6,'SEED-ILOT-006-1',0.0000,0.0000,'pcs','quarantine','2027-09-19 09:30:00','2026-10-19 09:40:05'),(12,7,7,7,'SEED-ILOT-007-1',0.0000,0.0000,'roll','rejected','2027-09-20 09:30:00','2026-10-19 09:40:05'),(13,8,8,8,'SEED-ILOT-008-1',170.0000,0.0000,'pcs','available','2027-09-21 09:30:00','2026-10-19 09:40:05'),(14,9,9,9,'SEED-ILOT-009-1',180.0000,0.0000,'pcs','available','2027-09-22 09:30:00','2026-10-19 09:40:05'),(15,10,10,10,'SEED-ILOT-010-1',0.0000,0.0000,'kg','rejected','2027-09-23 09:30:00','2026-10-19 09:40:05'),(16,11,11,11,'SEED-ILOT-011-1',200.0000,0.0000,'pcs','available','2027-09-24 09:30:00','2026-10-19 09:40:05'),(17,12,12,12,'SEED-ILOT-012-1',0.0000,0.0000,'m','quarantine','2027-09-25 09:30:00','2026-10-19 09:40:05'),(18,1,13,13,'SEED-ILOT-013-1',220.0000,0.0000,'pcs','available','2027-09-26 09:30:00','2026-10-19 09:40:05'),(19,2,14,14,'SEED-ILOT-014-1',0.0000,0.0000,'pcs','rejected','2027-09-27 09:30:00','2026-10-19 09:40:05'),(20,3,15,15,'SEED-ILOT-015-1',240.0000,0.0000,'pcs','available','2027-09-28 09:30:00','2026-10-19 09:40:05'),(21,4,16,16,'SEED-ILOT-016-1',0.0000,0.0000,'set','quarantine','2027-09-29 09:30:00','2026-10-19 09:40:05'),(22,5,17,17,'SEED-ILOT-017-1',260.0000,0.0000,'pcs','available','2027-09-30 09:30:00','2026-10-19 09:40:05'),(23,6,18,18,'SEED-ILOT-018-1',0.0000,0.0000,'pcs','rejected','2027-10-01 09:30:00','2026-10-19 09:40:05'),(24,7,19,19,'SEED-ILOT-019-1',280.0000,0.0000,'roll','available','2027-10-02 09:30:00','2026-10-19 09:40:05'),(25,8,20,20,'SEED-ILOT-020-1',290.0000,0.0000,'pcs','available','2027-10-03 09:30:00','2026-10-19 09:40:05'),(26,1,1,21,'LIVE-ILOT-20261019-01',25.0000,0.0000,'pcs','available','2027-09-14 09:30:00','2026-10-19 10:11:36');
/*!40000 ALTER TABLE `internal_material_lots` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `iqc_records`
--

DROP TABLE IF EXISTS `iqc_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `iqc_records` (
  `id` int NOT NULL COMMENT '檢驗紀錄主鍵',
  `receipt_id` int DEFAULT NULL COMMENT '關聯收料紀錄主鍵',
  `internal_lot_id` int DEFAULT NULL COMMENT '關聯內部批次主鍵',
  `inspector_user_id` int DEFAULT NULL COMMENT '檢驗人員主鍵',
  `sample_qty` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '抽樣數量',
  `inspection_result` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'pending' COMMENT '檢驗結果',
  `inspection_date` datetime DEFAULT NULL COMMENT '檢驗日期',
  `release_status` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'hold' COMMENT '放行狀態',
  `remarks` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '檢驗備註',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
  PRIMARY KEY (`id`),
  KEY `ix_iqc_records_id` (`id`),
  KEY `ix_iqc_records_inspection_result` (`inspection_result`),
  KEY `ix_iqc_records_internal_lot_id` (`internal_lot_id`),
  KEY `ix_iqc_records_receipt_id` (`receipt_id`),
  KEY `ix_iqc_records_release_status` (`release_status`),
  KEY `iqc_records_ibfk_3` (`inspector_user_id`),
  CONSTRAINT `iqc_records_ibfk_1` FOREIGN KEY (`receipt_id`) REFERENCES `material_receipts` (`id`),
  CONSTRAINT `iqc_records_ibfk_2` FOREIGN KEY (`internal_lot_id`) REFERENCES `internal_material_lots` (`id`),
  CONSTRAINT `iqc_records_ibfk_3` FOREIGN KEY (`inspector_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='來料檢驗紀錄';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `iqc_records`
--

LOCK TABLES `iqc_records` WRITE;
/*!40000 ALTER TABLE `iqc_records` DISABLE KEYS */;
INSERT INTO `iqc_records` VALUES (1,1,1,2,0.2500,'passed','2026-09-15 09:30:00','released','Seeded inspection outcome: passed','2026-10-19 09:40:05'),(2,1,2,2,0.2500,'passed','2026-09-15 09:30:00','released','Seeded inspection outcome: passed','2026-10-19 09:40:05'),(3,2,3,3,0.2500,'pending',NULL,'hold','Seeded inspection outcome: pending','2026-10-19 09:40:05'),(4,2,4,3,0.2500,'pending',NULL,'hold','Seeded inspection outcome: pending','2026-10-19 09:40:05'),(5,3,5,2,0.2500,'failed','2026-09-17 09:30:00','rejected','Seeded inspection outcome: failed','2026-10-19 09:40:05'),(6,3,6,2,0.2500,'failed','2026-09-17 09:30:00','rejected','Seeded inspection outcome: failed','2026-10-19 09:40:05'),(7,4,7,3,0.2500,'passed','2026-09-18 09:30:00','released','Seeded inspection outcome: passed','2026-10-19 09:40:05'),(8,4,8,3,0.2500,'passed','2026-09-18 09:30:00','released','Seeded inspection outcome: passed','2026-10-19 09:40:05'),(9,5,9,2,0.2500,'passed','2026-09-19 09:30:00','released','Seeded inspection outcome: passed','2026-10-19 09:40:05'),(10,5,10,2,0.2500,'passed','2026-09-19 09:30:00','released','Seeded inspection outcome: passed','2026-10-19 09:40:05'),(11,6,11,3,0.2500,'pending',NULL,'hold','Seeded inspection outcome: pending','2026-10-19 09:40:05'),(12,7,12,2,0.2500,'failed','2026-09-21 09:30:00','rejected','Seeded inspection outcome: failed','2026-10-19 09:40:05'),(13,8,13,3,0.2500,'passed','2026-09-22 09:30:00','released','Seeded inspection outcome: passed','2026-10-19 09:40:05'),(14,9,14,2,0.2500,'passed','2026-09-23 09:30:00','released','Seeded inspection outcome: passed','2026-10-19 09:40:05'),(15,10,15,3,0.2500,'failed','2026-09-24 09:30:00','rejected','Seeded inspection outcome: failed','2026-10-19 09:40:05'),(16,11,16,2,0.2500,'passed','2026-09-25 09:30:00','released','Seeded inspection outcome: passed','2026-10-19 09:40:05'),(17,12,17,3,0.2500,'pending',NULL,'hold','Seeded inspection outcome: pending','2026-10-19 09:40:05'),(18,13,18,2,0.2500,'passed','2026-09-27 09:30:00','released','Seeded inspection outcome: passed','2026-10-19 09:40:05'),(19,14,19,3,0.2500,'failed','2026-09-28 09:30:00','rejected','Seeded inspection outcome: failed','2026-10-19 09:40:05'),(20,15,20,2,0.2500,'passed','2026-09-29 09:30:00','released','Seeded inspection outcome: passed','2026-10-19 09:40:05'),(21,16,21,3,0.2500,'pending',NULL,'hold','Seeded inspection outcome: pending','2026-10-19 09:40:05'),(22,17,22,2,0.2500,'passed','2026-10-01 09:30:00','released','Seeded inspection outcome: passed','2026-10-19 09:40:05'),(23,18,23,3,0.2500,'failed','2026-10-02 09:30:00','rejected','Seeded inspection outcome: failed','2026-10-19 09:40:05'),(24,19,24,2,0.2500,'passed','2026-10-03 09:30:00','released','Seeded inspection outcome: passed','2026-10-19 09:40:05'),(25,20,25,3,0.2500,'passed','2026-10-04 09:30:00','released','Seeded inspection outcome: passed','2026-10-19 09:40:05'),(26,NULL,26,1,10.0000,'passed','2026-10-19 10:00:00','released','HTTP validation pass','2026-10-19 10:11:36');
/*!40000 ALTER TABLE `iqc_records` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `material_receipts`
--

DROP TABLE IF EXISTS `material_receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `material_receipts` (
  `id` int NOT NULL COMMENT '收料紀錄主鍵',
  `supplier_id` int NOT NULL COMMENT '供應商主鍵',
  `material_id` int NOT NULL COMMENT '原物料主鍵',
  `supplier_lot_id` int NOT NULL COMMENT '供應商批次主鍵',
  `receipt_no` varchar(80) COLLATE utf8mb4_general_ci NOT NULL COMMENT '收料單號',
  `received_at` datetime NOT NULL COMMENT '收料時間',
  `received_by_user_id` int DEFAULT NULL COMMENT '收料人員主鍵',
  `qty_received` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '實際收料數量',
  `qty_remaining` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '剩餘可用數量',
  `status` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'received' COMMENT '收料狀態',
  `notes` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '收料備註',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_material_receipts_receipt_no` (`receipt_no`),
  UNIQUE KEY `ix_material_receipts_receipt_no` (`receipt_no`),
  KEY `ix_material_receipts_id` (`id`),
  KEY `ix_material_receipts_material_id` (`material_id`),
  KEY `ix_material_receipts_received_at` (`received_at`),
  KEY `ix_material_receipts_received_by_user_id` (`received_by_user_id`),
  KEY `ix_material_receipts_status` (`status`),
  KEY `ix_material_receipts_supplier_id` (`supplier_id`),
  KEY `material_receipts_ibfk_3` (`supplier_lot_id`),
  CONSTRAINT `material_receipts_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`),
  CONSTRAINT `material_receipts_ibfk_2` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`),
  CONSTRAINT `material_receipts_ibfk_3` FOREIGN KEY (`supplier_lot_id`) REFERENCES `supplier_lots` (`id`),
  CONSTRAINT `material_receipts_ibfk_4` FOREIGN KEY (`received_by_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='原物料收料紀錄';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `material_receipts`
--

LOCK TABLES `material_receipts` WRITE;
/*!40000 ALTER TABLE `material_receipts` DISABLE KEYS */;
INSERT INTO `material_receipts` VALUES (1,1,1,1,'SEED-REC-001','2026-09-14 09:30:00',4,100.0000,100.0000,'received','Development QA scenario: passed','2026-10-19 09:40:05'),(2,2,2,2,'SEED-REC-002','2026-09-15 09:30:00',4,110.0000,0.0000,'received','Development QA scenario: pending','2026-10-19 09:40:05'),(3,3,3,3,'SEED-REC-003','2026-09-16 09:30:00',4,120.0000,0.0000,'received','Development QA scenario: failed','2026-10-19 09:40:05'),(4,4,4,4,'SEED-REC-004','2026-09-17 09:30:00',4,130.0000,130.0000,'received','Development QA scenario: passed','2026-10-19 09:40:05'),(5,5,5,5,'SEED-REC-005','2026-09-18 09:30:00',4,140.0000,140.0000,'received','Development QA scenario: passed','2026-10-19 09:40:05'),(6,6,6,6,'SEED-REC-006','2026-09-19 09:30:00',4,150.0000,0.0000,'received','Development QA scenario: pending','2026-10-19 09:40:05'),(7,1,7,7,'SEED-REC-007','2026-09-20 09:30:00',4,160.0000,0.0000,'received','Development QA scenario: failed','2026-10-19 09:40:05'),(8,2,8,8,'SEED-REC-008','2026-09-21 09:30:00',4,170.0000,170.0000,'received','Development QA scenario: passed','2026-10-19 09:40:05'),(9,3,9,9,'SEED-REC-009','2026-09-22 09:30:00',4,180.0000,180.0000,'received','Development QA scenario: passed','2026-10-19 09:40:05'),(10,4,10,10,'SEED-REC-010','2026-09-23 09:30:00',4,190.0000,0.0000,'received','Development QA scenario: failed','2026-10-19 09:40:05'),(11,5,11,11,'SEED-REC-011','2026-09-24 09:30:00',4,200.0000,200.0000,'received','Development QA scenario: passed','2026-10-19 09:40:05'),(12,6,12,12,'SEED-REC-012','2026-09-25 09:30:00',4,210.0000,0.0000,'received','Development QA scenario: pending','2026-10-19 09:40:05'),(13,1,1,13,'SEED-REC-013','2026-09-26 09:30:00',4,220.0000,220.0000,'received','Development QA scenario: passed','2026-10-19 09:40:05'),(14,2,2,14,'SEED-REC-014','2026-09-27 09:30:00',4,230.0000,0.0000,'received','Development QA scenario: failed','2026-10-19 09:40:05'),(15,3,3,15,'SEED-REC-015','2026-09-28 09:30:00',4,240.0000,240.0000,'received','Development QA scenario: passed','2026-10-19 09:40:05'),(16,4,4,16,'SEED-REC-016','2026-09-29 09:30:00',4,250.0000,0.0000,'received','Development QA scenario: pending','2026-10-19 09:40:05'),(17,5,5,17,'SEED-REC-017','2026-09-30 09:30:00',4,260.0000,260.0000,'received','Development QA scenario: passed','2026-10-19 09:40:05'),(18,6,6,18,'SEED-REC-018','2026-10-01 09:30:00',4,270.0000,0.0000,'received','Development QA scenario: failed','2026-10-19 09:40:05'),(19,1,7,19,'SEED-REC-019','2026-10-02 09:30:00',4,280.0000,280.0000,'received','Development QA scenario: passed','2026-10-19 09:40:05'),(20,2,8,20,'SEED-REC-020','2026-10-03 09:30:00',4,290.0000,290.0000,'received','Development QA scenario: passed','2026-10-19 09:40:05'),(21,1,1,1,'LIVE-REC-20261019-01','2026-10-19 09:30:00',4,50.0000,25.0000,'received','HTTP validation receipt','2026-10-19 10:11:36');
/*!40000 ALTER TABLE `material_receipts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `materials`
--

DROP TABLE IF EXISTS `materials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `materials` (
  `id` int NOT NULL COMMENT '原物料主鍵',
  `material_code` varchar(80) COLLATE utf8mb4_general_ci NOT NULL COMMENT '原物料代碼',
  `material_name` varchar(200) COLLATE utf8mb4_general_ci NOT NULL COMMENT '原物料名稱',
  `material_type` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '物料類型',
  `spec` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '規格說明',
  `uom` varchar(30) COLLATE utf8mb4_general_ci NOT NULL COMMENT '計量單位',
  `status` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'active' COMMENT '物料狀態',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_materials_material_code` (`material_code`),
  UNIQUE KEY `ix_materials_material_code` (`material_code`),
  KEY `ix_materials_id` (`id`),
  KEY `ix_materials_material_name` (`material_name`),
  KEY `ix_materials_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='原物料主檔';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `materials`
--

LOCK TABLES `materials` WRITE;
/*!40000 ALTER TABLE `materials` DISABLE KEYS */;
INSERT INTO `materials` VALUES (1,'SEED-MAT-001','Aluminum Housing','metal','ADC12 die-cast, 120 x 80 mm','pcs','active','2026-10-19 09:40:05','2026-10-19 09:40:05'),(2,'SEED-MAT-002','Copper Busbar','metal','C1100, 3 x 25 x 200 mm','pcs','active','2026-10-19 09:40:05','2026-10-19 09:40:05'),(3,'SEED-MAT-003','Silicone Gasket','polymer','VMQ, 60 Shore A, 2 mm','pcs','active','2026-10-19 09:40:05','2026-10-19 09:40:05'),(4,'SEED-MAT-004','Epoxy Adhesive','chemical','Two-part, 1:1 mix, 500 ml','set','active','2026-10-19 09:40:05','2026-10-19 09:40:05'),(5,'SEED-MAT-005','Control PCB','electronic','FR-4, 4-layer, 1.6 mm','pcs','active','2026-10-19 09:40:05','2026-10-19 09:40:05'),(6,'SEED-MAT-006','Stainless Fastener','hardware','SUS304 M4 x 12 mm','pcs','active','2026-10-19 09:40:05','2026-10-19 09:40:05'),(7,'SEED-MAT-007','Protective Film','packaging','PE, 0.08 mm x 500 mm','roll','active','2026-10-19 09:40:05','2026-10-19 09:40:05'),(8,'SEED-MAT-008','Thermal Pad','polymer','Silicone, 3 W/mK, 1 mm','pcs','active','2026-10-19 09:40:05','2026-10-19 09:40:05'),(9,'SEED-MAT-009','Power Connector','electronic','10-pin, 5.08 mm pitch','pcs','active','2026-10-19 09:40:05','2026-10-19 09:40:05'),(10,'SEED-MAT-010','Powder Coating','chemical','RAL 9005, matte black','kg','active','2026-10-19 09:40:05','2026-10-19 09:40:05'),(11,'SEED-MAT-011','Carton Box','packaging','Double-wall, 400 x 300 x 200 mm','pcs','active','2026-10-19 09:40:05','2026-10-19 09:40:05'),(12,'SEED-MAT-012','Copper Wire','metal','Annealed copper, 1.5 mm²','m','active','2026-10-19 09:40:05','2026-10-19 09:40:05');
/*!40000 ALTER TABLE `materials` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `permissions`
--

DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions` (
  `id` int NOT NULL COMMENT '權限主鍵編號',
  `code` varchar(80) COLLATE utf8mb4_general_ci NOT NULL COMMENT '權限代碼',
  `name` varchar(120) COLLATE utf8mb4_general_ci NOT NULL COMMENT '權限名稱',
  `description` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '權限說明',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_permissions_code` (`code`),
  UNIQUE KEY `ix_permissions_code` (`code`),
  KEY `ix_permissions_id` (`id`),
  KEY `ix_permissions_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='權限項目定義';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `permissions`
--

LOCK TABLES `permissions` WRITE;
/*!40000 ALTER TABLE `permissions` DISABLE KEYS */;
INSERT INTO `permissions` VALUES (1,'seed:suppliers:read','Read suppliers','Seed permission: Read suppliers','2026-10-19 09:40:05','2026-10-19 09:40:05'),(2,'seed:suppliers:write','Manage suppliers','Seed permission: Manage suppliers','2026-10-19 09:40:05','2026-10-19 09:40:05'),(3,'seed:materials:read','Read materials','Seed permission: Read materials','2026-10-19 09:40:05','2026-10-19 09:40:05'),(4,'seed:materials:write','Manage materials','Seed permission: Manage materials','2026-10-19 09:40:05','2026-10-19 09:40:05'),(5,'seed:receipts:read','Read material receipts','Seed permission: Read material receipts','2026-10-19 09:40:05','2026-10-19 09:40:05'),(6,'seed:receipts:write','Create material receipts','Seed permission: Create material receipts','2026-10-19 09:40:05','2026-10-19 09:40:05'),(7,'seed:iqc:read','Read incoming inspections','Seed permission: Read incoming inspections','2026-10-19 09:40:05','2026-10-19 09:40:05'),(8,'seed:iqc:write','Manage incoming inspections','Seed permission: Manage incoming inspections','2026-10-19 09:40:05','2026-10-19 09:40:05'),(9,'seed:users:manage','Manage user access','Seed permission: Manage user access','2026-10-19 09:40:05','2026-10-19 09:40:05');
/*!40000 ALTER TABLE `permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `role_permissions`
--

DROP TABLE IF EXISTS `role_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_permissions` (
  `id` int NOT NULL COMMENT '對應紀錄主鍵',
  `role_id` int NOT NULL COMMENT '角色主鍵',
  `permission_id` int NOT NULL COMMENT '權限主鍵',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '對應建立時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_role_permissions_role_permission` (`role_id`,`permission_id`),
  KEY `ix_role_permissions_id` (`id`),
  KEY `ix_role_permissions_permission_id` (`permission_id`),
  KEY `ix_role_permissions_role_id` (`role_id`),
  CONSTRAINT `role_permissions_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`),
  CONSTRAINT `role_permissions_ibfk_2` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='角色權限對應表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `role_permissions`
--

LOCK TABLES `role_permissions` WRITE;
/*!40000 ALTER TABLE `role_permissions` DISABLE KEYS */;
INSERT INTO `role_permissions` VALUES (1,1,1,'2026-10-19 09:40:05'),(2,1,2,'2026-10-19 09:40:05'),(3,1,3,'2026-10-19 09:40:05'),(4,1,4,'2026-10-19 09:40:05'),(5,1,5,'2026-10-19 09:40:05'),(6,1,6,'2026-10-19 09:40:05'),(7,1,7,'2026-10-19 09:40:05'),(8,1,8,'2026-10-19 09:40:05'),(9,1,9,'2026-10-19 09:40:05'),(10,2,1,'2026-10-19 09:40:05'),(11,2,3,'2026-10-19 09:40:05'),(12,2,5,'2026-10-19 09:40:05'),(13,2,7,'2026-10-19 09:40:05'),(14,2,8,'2026-10-19 09:40:05'),(15,3,1,'2026-10-19 09:40:05'),(16,3,3,'2026-10-19 09:40:05'),(17,3,5,'2026-10-19 09:40:05'),(18,3,6,'2026-10-19 09:40:05');
/*!40000 ALTER TABLE `role_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` int NOT NULL COMMENT '角色主鍵編號',
  `name` varchar(80) COLLATE utf8mb4_general_ci NOT NULL COMMENT '角色名稱',
  `description` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '角色說明',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_name` (`name`),
  UNIQUE KEY `ix_roles_name` (`name`),
  KEY `ix_roles_id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='角色定義';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'SMTMS Seed Administrator','Development-only test administrator','2026-10-19 09:40:05','2026-10-19 09:40:05'),(2,'SMTMS Seed QA','Development-only quality inspector','2026-10-19 09:40:05','2026-10-19 09:40:05'),(3,'SMTMS Seed Receiver','Development-only receiving clerk','2026-10-19 09:40:05','2026-10-19 09:40:05');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `supplier_lots`
--

DROP TABLE IF EXISTS `supplier_lots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `supplier_lots` (
  `id` int NOT NULL COMMENT '批次主鍵',
  `supplier_id` int NOT NULL COMMENT '供應商主鍵',
  `material_id` int NOT NULL COMMENT '原物料主鍵',
  `supplier_lot_no` varchar(120) COLLATE utf8mb4_general_ci NOT NULL COMMENT '供應商批號',
  `manufacturing_date` datetime DEFAULT NULL COMMENT '製造日期',
  `expiry_date` datetime DEFAULT NULL COMMENT '有效日期',
  `qty_received` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '收貨數量',
  `uom` varchar(30) COLLATE utf8mb4_general_ci NOT NULL COMMENT '批次計量單位',
  `qc_status` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'received' COMMENT '品質狀態',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_supplier_lots_supplier_material_lot` (`supplier_id`,`material_id`,`supplier_lot_no`),
  KEY `ix_supplier_lots_id` (`id`),
  KEY `ix_supplier_lots_material_id` (`material_id`),
  KEY `ix_supplier_lots_qc_status` (`qc_status`),
  KEY `ix_supplier_lots_supplier_id` (`supplier_id`),
  KEY `ix_supplier_lots_supplier_lot_no` (`supplier_lot_no`),
  CONSTRAINT `supplier_lots_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`),
  CONSTRAINT `supplier_lots_ibfk_2` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='供應商批次資料';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `supplier_lots`
--

LOCK TABLES `supplier_lots` WRITE;
/*!40000 ALTER TABLE `supplier_lots` DISABLE KEYS */;
INSERT INTO `supplier_lots` VALUES (1,1,1,'SEED-SLOT-001','2026-08-15 09:30:00','2027-09-14 09:30:00',100.0000,'pcs','passed','2026-10-19 09:40:05'),(2,2,2,'SEED-SLOT-002','2026-08-16 09:30:00','2027-09-15 09:30:00',110.0000,'pcs','pending','2026-10-19 09:40:05'),(3,3,3,'SEED-SLOT-003','2026-08-17 09:30:00','2027-09-16 09:30:00',120.0000,'pcs','failed','2026-10-19 09:40:05'),(4,4,4,'SEED-SLOT-004','2026-08-18 09:30:00','2027-09-17 09:30:00',130.0000,'set','passed','2026-10-19 09:40:05'),(5,5,5,'SEED-SLOT-005','2026-08-19 09:30:00','2027-09-18 09:30:00',140.0000,'pcs','passed','2026-10-19 09:40:05'),(6,6,6,'SEED-SLOT-006','2026-08-20 09:30:00','2027-09-19 09:30:00',150.0000,'pcs','pending','2026-10-19 09:40:05'),(7,1,7,'SEED-SLOT-007','2026-08-21 09:30:00','2027-09-20 09:30:00',160.0000,'roll','failed','2026-10-19 09:40:05'),(8,2,8,'SEED-SLOT-008','2026-08-22 09:30:00','2027-09-21 09:30:00',170.0000,'pcs','passed','2026-10-19 09:40:05'),(9,3,9,'SEED-SLOT-009','2026-08-23 09:30:00','2027-09-22 09:30:00',180.0000,'pcs','passed','2026-10-19 09:40:05'),(10,4,10,'SEED-SLOT-010','2026-08-24 09:30:00','2027-09-23 09:30:00',190.0000,'kg','failed','2026-10-19 09:40:05'),(11,5,11,'SEED-SLOT-011','2026-08-25 09:30:00','2027-09-24 09:30:00',200.0000,'pcs','passed','2026-10-19 09:40:05'),(12,6,12,'SEED-SLOT-012','2026-08-26 09:30:00','2027-09-25 09:30:00',210.0000,'m','pending','2026-10-19 09:40:05'),(13,1,1,'SEED-SLOT-013','2026-08-27 09:30:00','2027-09-26 09:30:00',220.0000,'pcs','passed','2026-10-19 09:40:05'),(14,2,2,'SEED-SLOT-014','2026-08-28 09:30:00','2027-09-27 09:30:00',230.0000,'pcs','failed','2026-10-19 09:40:05'),(15,3,3,'SEED-SLOT-015','2026-08-29 09:30:00','2027-09-28 09:30:00',240.0000,'pcs','passed','2026-10-19 09:40:05'),(16,4,4,'SEED-SLOT-016','2026-08-30 09:30:00','2027-09-29 09:30:00',250.0000,'set','pending','2026-10-19 09:40:05'),(17,5,5,'SEED-SLOT-017','2026-08-31 09:30:00','2027-09-30 09:30:00',260.0000,'pcs','passed','2026-10-19 09:40:05'),(18,6,6,'SEED-SLOT-018','2026-09-01 09:30:00','2027-10-01 09:30:00',270.0000,'pcs','failed','2026-10-19 09:40:05'),(19,1,7,'SEED-SLOT-019','2026-09-02 09:30:00','2027-10-02 09:30:00',280.0000,'roll','passed','2026-10-19 09:40:05'),(20,2,8,'SEED-SLOT-020','2026-09-03 09:30:00','2027-10-03 09:30:00',290.0000,'pcs','passed','2026-10-19 09:40:05');
/*!40000 ALTER TABLE `supplier_lots` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `supplier_materials`
--

DROP TABLE IF EXISTS `supplier_materials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `supplier_materials` (
  `id` int NOT NULL COMMENT '對應紀錄主鍵',
  `supplier_id` int NOT NULL COMMENT '供應商主鍵',
  `material_id` int NOT NULL COMMENT '原物料主鍵',
  `supplier_material_code` varchar(80) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '供應商料號',
  `is_preferred` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否為首選供應商',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_supplier_materials_supplier_material` (`supplier_id`,`material_id`),
  KEY `ix_supplier_materials_id` (`id`),
  KEY `ix_supplier_materials_material_id` (`material_id`),
  KEY `ix_supplier_materials_supplier_id` (`supplier_id`),
  KEY `ix_supplier_materials_supplier_material_code` (`supplier_material_code`),
  CONSTRAINT `supplier_materials_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`),
  CONSTRAINT `supplier_materials_ibfk_2` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='供應商原物料對應表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `supplier_materials`
--

LOCK TABLES `supplier_materials` WRITE;
/*!40000 ALTER TABLE `supplier_materials` DISABLE KEYS */;
INSERT INTO `supplier_materials` VALUES (1,1,1,'SEED-SUP-001-001',1,'2026-10-19 09:40:05'),(2,2,1,'SEED-SUP-002-001',0,'2026-10-19 09:40:05'),(3,2,2,'SEED-SUP-002-002',1,'2026-10-19 09:40:05'),(4,3,2,'SEED-SUP-003-002',0,'2026-10-19 09:40:05'),(5,3,3,'SEED-SUP-003-003',1,'2026-10-19 09:40:05'),(6,4,3,'SEED-SUP-004-003',0,'2026-10-19 09:40:05'),(7,4,4,'SEED-SUP-004-004',1,'2026-10-19 09:40:05'),(8,5,4,'SEED-SUP-005-004',0,'2026-10-19 09:40:05'),(9,5,5,'SEED-SUP-005-005',1,'2026-10-19 09:40:05'),(10,6,5,'SEED-SUP-006-005',0,'2026-10-19 09:40:05'),(11,6,6,'SEED-SUP-006-006',1,'2026-10-19 09:40:05'),(12,1,6,'SEED-SUP-001-006',0,'2026-10-19 09:40:05'),(13,1,7,'SEED-SUP-001-007',1,'2026-10-19 09:40:05'),(14,2,7,'SEED-SUP-002-007',0,'2026-10-19 09:40:05'),(15,2,8,'SEED-SUP-002-008',1,'2026-10-19 09:40:05'),(16,3,8,'SEED-SUP-003-008',0,'2026-10-19 09:40:05'),(17,3,9,'SEED-SUP-003-009',1,'2026-10-19 09:40:05'),(18,4,9,'SEED-SUP-004-009',0,'2026-10-19 09:40:05'),(19,4,10,'SEED-SUP-004-010',1,'2026-10-19 09:40:05'),(20,5,10,'SEED-SUP-005-010',0,'2026-10-19 09:40:05'),(21,5,11,'SEED-SUP-005-011',1,'2026-10-19 09:40:05'),(22,6,11,'SEED-SUP-006-011',0,'2026-10-19 09:40:05'),(23,6,12,'SEED-SUP-006-012',1,'2026-10-19 09:40:05'),(24,1,12,'SEED-SUP-001-012',0,'2026-10-19 09:40:05');
/*!40000 ALTER TABLE `supplier_materials` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `supplier_qualification_documents`
--

DROP TABLE IF EXISTS `supplier_qualification_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `supplier_qualification_documents` (
  `id` int NOT NULL COMMENT '文件紀錄主鍵',
  `supplier_id` int NOT NULL COMMENT '對應供應商主鍵',
  `doc_type` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '文件類型',
  `doc_code` varchar(80) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '文件編號',
  `doc_name` varchar(200) COLLATE utf8mb4_general_ci NOT NULL COMMENT '文件名稱',
  `file_path` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '文件存放路徑',
  `issued_at` datetime DEFAULT NULL COMMENT '發證日期',
  `expires_at` datetime DEFAULT NULL COMMENT '到期日期',
  `approved_by_user_id` int DEFAULT NULL COMMENT '審核人員主鍵',
  `status` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'active' COMMENT '文件狀態',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
  PRIMARY KEY (`id`),
  KEY `ix_supplier_qualification_documents_approved_by_user_id` (`approved_by_user_id`),
  KEY `ix_supplier_qualification_documents_doc_type` (`doc_type`),
  KEY `ix_supplier_qualification_documents_id` (`id`),
  KEY `ix_supplier_qualification_documents_status` (`status`),
  KEY `ix_supplier_qualification_documents_supplier_id` (`supplier_id`),
  CONSTRAINT `supplier_qualification_documents_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`),
  CONSTRAINT `supplier_qualification_documents_ibfk_2` FOREIGN KEY (`approved_by_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='供應商資格文件紀錄';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `supplier_qualification_documents`
--

LOCK TABLES `supplier_qualification_documents` WRITE;
/*!40000 ALTER TABLE `supplier_qualification_documents` DISABLE KEYS */;
INSERT INTO `supplier_qualification_documents` VALUES (1,1,'ISO 9001','SEED-CERT-001','Harbor Industrial Supply Quality Certificate','seed-documents/suppliers/SEED-SUP-001/iso-9001.pdf','2026-09-14 00:00:00','2027-09-14 00:00:00',2,'active','2026-10-19 09:40:05'),(2,2,'ISO 9001','SEED-CERT-002','Evergreen Polymer Co. Quality Certificate','seed-documents/suppliers/SEED-SUP-002/iso-9001.pdf','2025-11-08 00:00:00','2026-11-08 00:00:00',2,'expiring','2026-10-19 09:40:05'),(3,3,'ISO 9001','SEED-CERT-003','Northstar Components Quality Certificate','seed-documents/suppliers/SEED-SUP-003/iso-9001.pdf','2025-09-19 00:00:00','2026-09-19 00:00:00',2,'expired','2026-10-19 09:40:05'),(4,4,'ISO 9001','SEED-CERT-004','Pacific Precision Materials Quality Certificate','seed-documents/suppliers/SEED-SUP-004/iso-9001.pdf','2026-09-14 00:00:00','2027-09-14 00:00:00',2,'active','2026-10-19 09:40:05'),(5,5,'ISO 9001','SEED-CERT-005','Summit Chemical Works Quality Certificate','seed-documents/suppliers/SEED-SUP-005/iso-9001.pdf','2025-11-08 00:00:00','2026-11-08 00:00:00',2,'expiring','2026-10-19 09:40:05'),(6,6,'ISO 9001','SEED-CERT-006','Cedar Packaging Group Quality Certificate','seed-documents/suppliers/SEED-SUP-006/iso-9001.pdf','2025-09-19 00:00:00','2026-09-19 00:00:00',2,'expired','2026-10-19 09:40:05');
/*!40000 ALTER TABLE `supplier_qualification_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `suppliers`
--

DROP TABLE IF EXISTS `suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suppliers` (
  `id` int NOT NULL COMMENT '供應商主鍵編號',
  `supplier_code` varchar(80) COLLATE utf8mb4_general_ci NOT NULL COMMENT '供應商代碼',
  `supplier_name` varchar(200) COLLATE utf8mb4_general_ci NOT NULL COMMENT '供應商名稱',
  `contact_name` varchar(120) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '聯絡人姓名',
  `phone` varchar(40) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '聯絡電話',
  `email` varchar(160) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '聯絡信箱',
  `status` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'active' COMMENT '供應商狀態',
  `address` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '供應商地址',
  `country` varchar(80) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '供應商所在國家',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_suppliers_supplier_code` (`supplier_code`),
  UNIQUE KEY `ix_suppliers_supplier_code` (`supplier_code`),
  KEY `ix_suppliers_id` (`id`),
  KEY `ix_suppliers_supplier_name` (`supplier_name`),
  KEY `ix_suppliers_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='供應商基本資料';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `suppliers`
--

LOCK TABLES `suppliers` WRITE;
/*!40000 ALTER TABLE `suppliers` DISABLE KEYS */;
INSERT INTO `suppliers` VALUES (1,'SEED-SUP-001','Harbor Industrial Supply','林怡君','02-2550-1001','harbor@example.test','active','No. 11, Industrial Road','Taiwan','2026-10-19 09:40:05','2026-10-19 09:40:05'),(2,'SEED-SUP-002','Evergreen Polymer Co.','陳冠宇','04-2300-2002','evergreen@example.test','active','No. 12, Industrial Road','Taiwan','2026-10-19 09:40:05','2026-10-19 09:40:05'),(3,'SEED-SUP-003','Northstar Components','王雅婷','03-5500-3003','northstar@example.test','active','No. 13, Industrial Road','Taiwan','2026-10-19 09:40:05','2026-10-19 09:40:05'),(4,'SEED-SUP-004','Pacific Precision Materials','李承翰','07-3300-4004','pacific@example.test','active','No. 14, Industrial Road','Taiwan','2026-10-19 09:40:05','2026-10-19 09:40:05'),(5,'SEED-SUP-005','Summit Chemical Works','張家豪','06-2200-5005','summit@example.test','active','No. 15, Industrial Road','Taiwan','2026-10-19 09:40:05','2026-10-19 09:40:05'),(6,'SEED-SUP-006','Cedar Packaging Group','黃詩涵','02-2600-6006','cedar@example.test','active','No. 16, Industrial Road','Taiwan','2026-10-19 09:40:05','2026-10-19 09:40:05');
/*!40000 ALTER TABLE `suppliers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_roles`
--

DROP TABLE IF EXISTS `user_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_roles` (
  `id` int NOT NULL COMMENT '對應紀錄主鍵',
  `user_id` int NOT NULL COMMENT '使用者主鍵',
  `role_id` int NOT NULL COMMENT '角色主鍵',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '對應建立時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_roles_user_role` (`user_id`,`role_id`),
  KEY `ix_user_roles_id` (`id`),
  KEY `ix_user_roles_role_id` (`role_id`),
  KEY `ix_user_roles_user_id` (`user_id`),
  CONSTRAINT `user_roles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `user_roles_ibfk_2` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='使用者角色對應表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_roles`
--

LOCK TABLES `user_roles` WRITE;
/*!40000 ALTER TABLE `user_roles` DISABLE KEYS */;
INSERT INTO `user_roles` VALUES (1,1,1,'2026-10-19 09:40:05'),(2,2,2,'2026-10-19 09:40:05'),(3,3,2,'2026-10-19 09:40:05'),(4,4,3,'2026-10-19 09:40:05');
/*!40000 ALTER TABLE `user_roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL COMMENT '使用者主鍵編號',
  `username` varchar(80) COLLATE utf8mb4_general_ci NOT NULL COMMENT '登入帳號',
  `email` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '聯絡信箱',
  `password_hash` varchar(255) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'bcrypt 雜湊後密碼',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '帳號是否啟用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  UNIQUE KEY `ix_users_username` (`username`),
  KEY `ix_users_email` (`email`),
  KEY `ix_users_id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='使用者基本資料';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'seed_admin','seed_admin@example.test','$2b$12$5NdLp8vhF5GyJ66MdiI9feGqKbZQCKtN9kGukGCOkalqj5f/6JSre',1,'2026-10-19 09:40:05','2026-10-19 09:40:05'),(2,'seed_qa_1','seed_qa_1@example.test','$2b$12$5NdLp8vhF5GyJ66MdiI9feGqKbZQCKtN9kGukGCOkalqj5f/6JSre',1,'2026-10-19 09:40:05','2026-10-19 09:40:05'),(3,'seed_qa_2','seed_qa_2@example.test','$2b$12$5NdLp8vhF5GyJ66MdiI9feGqKbZQCKtN9kGukGCOkalqj5f/6JSre',1,'2026-10-19 09:40:05','2026-10-19 09:40:05'),(4,'seed_receiver_1','seed_receiver_1@example.test','$2b$12$5NdLp8vhF5GyJ66MdiI9feGqKbZQCKtN9kGukGCOkalqj5f/6JSre',1,'2026-10-19 09:40:05','2026-10-19 09:40:05');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'smtms'
--

--
-- Dumping routines for database 'smtms'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-19 13:43:39
