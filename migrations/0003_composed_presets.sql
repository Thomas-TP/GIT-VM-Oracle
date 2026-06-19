-- A request is now perf (kept in `preset`) × storage × os.
-- ssh_user depends on the OS image (ubuntu / admin / ec2-user).
ALTER TABLE vm_requests ADD COLUMN storage TEXT;
ALTER TABLE vm_requests ADD COLUMN os TEXT;
ALTER TABLE vms ADD COLUMN ssh_user TEXT;
