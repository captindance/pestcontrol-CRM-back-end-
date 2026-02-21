-- Remove approval workflow fields (replaced by audit trail)
ALTER TABLE `report_schedules` DROP COLUMN `requires_approval`;
ALTER TABLE `report_schedules` DROP COLUMN `approved_by`;
ALTER TABLE `report_schedules` DROP COLUMN `approved_at`;
