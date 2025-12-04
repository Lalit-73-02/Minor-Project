use attendo;

CREATE TABLE student_details (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  roll_no VARCHAR(50) NOT NULL UNIQUE,
  department VARCHAR(100) NOT NULL,
  year ENUM('1st year','2nd year','3rd year','4th year') NOT NULL,
  reference_photo VARCHAR(500) NULL,   -- this is add my antigravity
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fr_student_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

SELECT 
  u.id AS user_id,
  u.name,
  u.email,
  u.role,
  s.roll_no,
  s.department,
  s.year
FROM users u
LEFT JOIN student_details s 
  ON u.id = s.user_id
WHERE u.role = 'student';



