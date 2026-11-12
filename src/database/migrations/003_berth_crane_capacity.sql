-- Năng lực do người dùng khai báo; NULL là chưa có thông tin, không suy diễn từ số cầu.
ALTER TABLE quays ADD COLUMN available_cranes INTEGER CHECK (available_cranes >= 0);
