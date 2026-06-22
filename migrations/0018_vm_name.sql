-- User-chosen display name for each VM (shown across the portal, used as the EC2 Name tag).
ALTER TABLE vm_requests ADD COLUMN name TEXT;
