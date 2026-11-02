const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { initDb, dbRun, dbAll, dbGet } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure public/uploads directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Express Configurations
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session Configuration
app.use(session({
  secret: 'ndt_api_secret_session_key_2026',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Initialize database tables
initDb();

// Share session admin/user state and flash message alerts with all views
app.use((req, res, next) => {
  res.locals.isAdmin = req.session.isAdmin || false;
  res.locals.adminUser = req.session.adminUser || null;
  res.locals.isUser = req.session.isUser || false;
  res.locals.userId = req.session.userId || null;
  res.locals.currentUser = req.session.currentUser || null;
  res.locals.success_msg = req.session.success_msg || null;
  res.locals.error_msg = req.session.error_msg || null;
  
  // Clear messages after loading once
  delete req.session.success_msg;
  delete req.session.error_msg;
  next();
});

// Middleware to check Admin Authorization
const requireAdmin = (req, res, next) => {
  if (req.session.isAdmin) {
    next();
  } else {
    req.session.error_msg = 'Unauthorized. Please login first.';
    res.redirect('/admin');
  }
};

// Helper: Get dashboard stats
async function getStats() {
  const alumniCount = await dbGet(`SELECT COUNT(*) as count FROM alumni WHERE status != 'rejected'`);
  const noticesCount = await dbGet(`SELECT COUNT(*) as count FROM notices`);
  const batchesCount = await dbGet(`SELECT COUNT(DISTINCT batch) as count FROM alumni WHERE status != 'rejected'`);
  
  return {
    totalAlumni: alumniCount.count || 0,
    totalNotices: noticesCount.count || 0,
    totalBatches: batchesCount.count || 0
  };
}


/* ==========================================================================
   PUBLIC ROUTES
   ========================================================================== */

// 1. Homepage Route
app.get('/', async (req, res) => {
  try {
    const stats = await getStats();
    const recentNotices = await dbAll(`SELECT * FROM notices ORDER BY created_at DESC LIMIT 4`);
    res.render('index', { stats, recentNotices });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// 2. Directory Search & Filters Route
app.get('/directory', async (req, res) => {
  try {
    const { q, batch, field } = req.query;
    let query = `SELECT * FROM alumni WHERE status != 'rejected'`;
    let params = [];

    const trimmedQ = (q || '').trim();
    if (trimmedQ) {
      // Check if user typed something like "Batch 84"
      const batchMatch = trimmedQ.match(/\b\d+\b/);
      const isBatchSearch = trimmedQ.toLowerCase().includes('batch') && batchMatch;

      if (isBatchSearch) {
        query += ` AND (name LIKE ? OR serial_number LIKE ? OR card_number LIKE ? OR batch = ?)`;
        const searchWildcard = `%${trimmedQ}%`;
        params.push(searchWildcard, searchWildcard, searchWildcard, parseInt(batchMatch[0]));
      } else {
        query += ` AND (name LIKE ? OR serial_number LIKE ? OR card_number LIKE ? OR CAST(batch AS TEXT) LIKE ? OR field_of_study LIKE ?)`;
        const searchWildcard = `%${trimmedQ}%`;
        params.push(searchWildcard, searchWildcard, searchWildcard, searchWildcard, searchWildcard);
      }
    }

    if (batch && String(batch).trim() !== '') {
      query += ` AND batch = ?`;
      params.push(parseInt(batch));
    }

    if (field && String(field).trim() !== '') {
      query += ` AND field_of_study = ?`;
      params.push(String(field).trim());
    }

    query += ` ORDER BY batch DESC, serial_number ASC`;

    const alumni = await dbAll(query, params);
    res.render('directory', { 
      alumni, 
      filters: { q: trimmedQ, batch, field } 
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// 3. Notices & Announcements Route
app.get('/notices', async (req, res) => {
  try {
    const notices = await dbAll(`SELECT * FROM notices ORDER BY created_at DESC`);
    res.render('notices', { notices });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// 4. User Login & Registration Routes
app.get('/login', (req, res) => {
  if (req.session.isUser && req.session.userId) {
    return res.redirect(`/profile/${req.session.userId}`);
  }
  res.render('login');
});

app.post('/login', async (req, res) => {
  try {
    const identifier = (req.body.identifier || '').trim();
    const password = (req.body.password || '').trim();

    if (!identifier || !password) {
      req.session.error_msg = 'Please enter both your Serial Number/Email and Password.';
      return res.redirect('/login');
    }

    const alumnus = await dbGet(
      `SELECT * FROM alumni WHERE (LOWER(serial_number) = LOWER(?) OR LOWER(email) = LOWER(?)) AND status != 'rejected'`,
      [identifier, identifier]
    );

    if (alumnus && bcrypt.compareSync(password, alumnus.password_hash)) {
      req.session.isUser = true;
      req.session.userId = alumnus.id;
      req.session.currentUser = alumnus;
      req.session.success_msg = `Welcome back, ${alumnus.name}!`;
      return res.redirect(`/profile/${alumnus.id}`);
    } else {
      req.session.error_msg = 'Invalid Serial Number / Email or Password. Please try again.';
      return res.redirect('/login');
    }
  } catch (error) {
    console.error(error);
    req.session.error_msg = 'An error occurred during login. Please try again.';
    res.redirect('/login');
  }
});

app.get('/logout', (req, res) => {
  delete req.session.isUser;
  delete req.session.userId;
  delete req.session.currentUser;
  req.session.success_msg = 'You have logged out successfully.';
  res.redirect('/login');
});

// Register alias
app.get('/register', (req, res) => {
  res.redirect('/profile/new');
});

// Register Profile Form Route
app.get('/profile/new', (req, res) => {
  res.render('register', { isEdit: false });
});

// 5. Register Profile Submission Handler
app.post('/profile/new', upload.single('profile_pic'), async (req, res) => {
  try {
    const { name, batch, serial_number, card_number, field_of_study, email, phone, current_job, company, linkedin, password } = req.body;
    
    // Validation
    if (!name || !batch || !serial_number || !field_of_study || !password) {
      req.session.error_msg = 'Please fill out all required fields marked with *';
      return res.redirect('/profile/new');
    }

    // Check if Serial Number already exists
    const existing = await dbGet(`SELECT id FROM alumni WHERE LOWER(serial_number) = LOWER(?)`, [serial_number.trim()]);
    if (existing) {
      req.session.error_msg = `The Serial Number "${serial_number}" is already registered. If this is yours, please log in or edit your profile.`;
      return res.redirect('/profile/new');
    }

    // Encrypt password
    const salt = bcrypt.genSaltSync(10);
    const password_hash = bcrypt.hashSync(password, salt);
    
    // File upload file name
    const profile_pic = req.file ? req.file.filename : null;

    // Save profile to database (status: 'approved')
    const result = await dbRun(`
      INSERT INTO alumni (name, batch, serial_number, card_number, field_of_study, email, phone, current_job, company, linkedin, profile_pic, password_hash, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')
    `, [name.trim(), parseInt(batch), serial_number.trim(), card_number ? card_number.trim() : null, field_of_study.trim(), email ? email.trim() : null, phone ? phone.trim() : null, current_job ? current_job.trim() : null, company ? company.trim() : null, linkedin ? linkedin.trim() : null, profile_pic, password_hash]);

    const newId = result.lastID;
    const newAlumnus = await dbGet(`SELECT * FROM alumni WHERE id = ?`, [newId]);

    // Automatically log in the newcomer
    req.session.isUser = true;
    req.session.userId = newId;
    req.session.currentUser = newAlumnus;

    req.session.success_msg = `Welcome to NDT අපි, ${name}! Your profile has been created successfully.`;
    res.redirect(`/profile/${newId}`);
  } catch (error) {
    console.error(error);
    req.session.error_msg = 'An error occurred during registration. Please try again.';
    res.redirect('/profile/new');
  }
});

// 6. View Profile Route
app.get('/profile/:id', async (req, res) => {
  try {
    const alumnus = await dbGet(`SELECT * FROM alumni WHERE id = ?`, [req.params.id]);
    
    if (!alumnus) {
      req.session.error_msg = 'Profile not found.';
      return res.redirect('/directory');
    }

    res.render('profile', { alumnus });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// 7. Edit Profile Form Route
app.get('/profile/edit/:id', async (req, res) => {
  try {
    const alumnus = await dbGet(`SELECT * FROM alumni WHERE id = ?`, [req.params.id]);
    
    if (!alumnus) {
      req.session.error_msg = 'Profile not found.';
      return res.redirect('/directory');
    }

    res.render('register', { isEdit: true, alumnus });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// 8. Save Edited Profile Handler
app.post('/profile/edit/:id', upload.single('profile_pic'), async (req, res) => {
  try {
    const { name, batch, card_number, field_of_study, email, phone, current_job, company, linkedin, password } = req.body;
    const alumnusId = req.params.id;

    // Fetch existing profile
    const alumnus = await dbGet(`SELECT * FROM alumni WHERE id = ?`, [alumnusId]);
    if (!alumnus) {
      req.session.error_msg = 'Profile not found.';
      return res.redirect('/directory');
    }

    // Validate authorization (either logged in as this profile, admin, or correct password provided)
    const isOwner = (req.session.isUser && req.session.userId === parseInt(alumnusId)) || req.session.isAdmin;
    if (!isOwner) {
      const passwordMatch = password && bcrypt.compareSync(password, alumnus.password_hash);
      if (!passwordMatch) {
        req.session.error_msg = 'Invalid password. You must provide the correct password chosen at registration to save changes.';
        return res.redirect(`/profile/edit/${alumnusId}`);
      }
    }

    // Pic update setup
    let profile_pic = alumnus.profile_pic;
    if (req.file) {
      profile_pic = req.file.filename;
      // Delete old profile picture if exists
      if (alumnus.profile_pic) {
        const oldPath = path.join(uploadDir, alumnus.profile_pic);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
    }

    // Update query
    await dbRun(`
      UPDATE alumni 
      SET name = ?, batch = ?, card_number = ?, field_of_study = ?, email = ?, phone = ?, current_job = ?, company = ?, linkedin = ?, profile_pic = ?
      WHERE id = ?
    `, [name, parseInt(batch), card_number, field_of_study, email, phone, current_job, company, linkedin, profile_pic, alumnusId]);

    if (req.session.isUser && req.session.userId === parseInt(alumnusId)) {
      req.session.currentUser = await dbGet(`SELECT * FROM alumni WHERE id = ?`, [alumnusId]);
    }

    req.session.success_msg = 'Profile updated successfully!';
    res.redirect(`/profile/${alumnusId}`);
  } catch (error) {
    console.error(error);
    req.session.error_msg = 'An error occurred while updating the profile.';
    res.redirect(`/profile/edit/${req.params.id}`);
  }
});


/* ==========================================================================
   ADMIN PORTAL ROUTES
   ========================================================================== */

// 9. Admin Page Router
app.get('/admin', async (req, res) => {
  try {
    if (req.session.isAdmin) {
      const stats = await getStats();
      const pendingAlumni = await dbAll(`SELECT * FROM alumni WHERE status = 'pending' ORDER BY created_at DESC`);
      const approvedAlumni = await dbAll(`SELECT * FROM alumni WHERE status = 'approved' ORDER BY batch DESC, name ASC`);
      const admins = await dbAll(`SELECT id, username FROM admins ORDER BY id ASC`);
      res.render('admin', { stats, pendingAlumni, approvedAlumni, admins });
    } else {
      res.render('admin');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// 10. Admin Login Handler
app.post('/admin/login', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const password = (req.body.password || '').trim();

    if (!username || !password) {
      req.session.error_msg = 'Please enter both username and password.';
      return res.redirect('/admin');
    }

    const admin = await dbGet(`SELECT * FROM admins WHERE LOWER(username) = LOWER(?)`, [username]);
    
    if (admin && bcrypt.compareSync(password, admin.password_hash)) {
      req.session.isAdmin = true;
      req.session.adminUser = admin.username;
      req.session.success_msg = `Welcome back, ${admin.username}!`;
      res.redirect('/admin');
    } else {
      req.session.error_msg = 'Invalid Admin credentials. Please check your username and password.';
      res.redirect('/admin');
    }
  } catch (error) {
    console.error(error);
    req.session.error_msg = 'Login error occurred.';
    res.redirect('/admin');
  }
});

// 11. Admin Logout Handler
app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin');
});

// 12. Approve Alumni Profile
app.post('/admin/alumni/approve/:id', requireAdmin, async (req, res) => {
  try {
    await dbRun(`UPDATE alumni SET status = 'approved' WHERE id = ?`, [req.params.id]);
    req.session.success_msg = 'Profile approved successfully!';
    res.redirect('/admin');
  } catch (error) {
    console.error(error);
    req.session.error_msg = 'Error approving profile.';
    res.redirect('/admin');
  }
});

// 13. Delete/Reject Alumni Profile
app.post('/admin/alumni/delete/:id', requireAdmin, async (req, res) => {
  try {
    const alumnus = await dbGet(`SELECT profile_pic FROM alumni WHERE id = ?`, [req.params.id]);
    
    // Delete profile picture if exists
    if (alumnus && alumnus.profile_pic) {
      const picPath = path.join(uploadDir, alumnus.profile_pic);
      if (fs.existsSync(picPath)) {
        fs.unlinkSync(picPath);
      }
    }

    await dbRun(`DELETE FROM alumni WHERE id = ?`, [req.params.id]);
    req.session.success_msg = 'Profile rejected/deleted successfully!';
    res.redirect('/admin');
  } catch (error) {
    console.error(error);
    req.session.error_msg = 'Error deleting profile.';
    res.redirect('/admin');
  }
});

// 14. Create Notice Handler
app.post('/admin/notice/new', requireAdmin, upload.single('notice_image'), async (req, res) => {
  try {
    const { title, category, content } = req.body;
    
    if (!title || !content) {
      req.session.error_msg = 'Title and Content are required fields.';
      return res.redirect('/admin');
    }

    const image_url = req.file ? req.file.filename : null;

    await dbRun(`
      INSERT INTO notices (title, content, category, image_url)
      VALUES (?, ?, ?, ?)
    `, [title, content, category, image_url]);

    req.session.success_msg = 'Notice posted successfully!';
    res.redirect('/notices');
  } catch (error) {
    console.error(error);
    req.session.error_msg = 'Error publishing notice.';
    res.redirect('/admin');
  }
});

// 15. Delete Notice Handler
app.post('/admin/notice/delete/:id', requireAdmin, async (req, res) => {
  try {
    const notice = await dbGet(`SELECT image_url FROM notices WHERE id = ?`, [req.params.id]);
    
    // Delete notice image if exists
    if (notice && notice.image_url) {
      const imgPath = path.join(uploadDir, notice.image_url);
      if (fs.existsSync(imgPath)) {
        fs.unlinkSync(imgPath);
      }
    }

    await dbRun(`DELETE FROM notices WHERE id = ?`, [req.params.id]);
    req.session.success_msg = 'Notice deleted successfully!';
    res.redirect('/notices');
  } catch (error) {
    console.error(error);
    req.session.error_msg = 'Error deleting notice.';
    res.redirect('/notices');
  }
});

// 16. Create New Admin Handler
app.post('/admin/create', requireAdmin, async (req, res) => {
  try {
    const { new_username, new_password, confirm_password } = req.body;
    
    if (!new_username || !new_password) {
      req.session.error_msg = 'Admin username and password are required.';
      return res.redirect('/admin');
    }

    if (new_password.length < 6) {
      req.session.error_msg = 'Admin password must be at least 6 characters.';
      return res.redirect('/admin');
    }

    if (new_password !== confirm_password) {
      req.session.error_msg = 'Passwords do not match.';
      return res.redirect('/admin');
    }

    const cleanUsername = new_username.trim();
    const existing = await dbGet(`SELECT id FROM admins WHERE username = ?`, [cleanUsername]);
    if (existing) {
      req.session.error_msg = `Admin username "${cleanUsername}" is already registered.`;
      return res.redirect('/admin');
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(new_password, salt);

    await dbRun(`INSERT INTO admins (username, password_hash) VALUES (?, ?)`, [cleanUsername, hash]);
    req.session.success_msg = `New Admin account "${cleanUsername}" created successfully!`;
    res.redirect('/admin');
  } catch (error) {
    console.error(error);
    req.session.error_msg = 'Error creating new admin account.';
    res.redirect('/admin');
  }
});

// 17. Change Admin Password Handler
app.post('/admin/change-password', requireAdmin, async (req, res) => {
  try {
    const { current_password, new_password, confirm_new_password } = req.body;
    const currentUsername = req.session.adminUser;

    const admin = await dbGet(`SELECT * FROM admins WHERE username = ?`, [currentUsername]);
    if (!admin || !bcrypt.compareSync(current_password, admin.password_hash)) {
      req.session.error_msg = 'Current admin password is incorrect.';
      return res.redirect('/admin');
    }

    if (!new_password || new_password.length < 6) {
      req.session.error_msg = 'New password must be at least 6 characters.';
      return res.redirect('/admin');
    }

    if (new_password !== confirm_new_password) {
      req.session.error_msg = 'New passwords do not match.';
      return res.redirect('/admin');
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(new_password, salt);

    await dbRun(`UPDATE admins SET password_hash = ? WHERE id = ?`, [hash, admin.id]);
    req.session.success_msg = 'Admin password updated successfully!';
    res.redirect('/admin');
  } catch (error) {
    console.error(error);
    req.session.error_msg = 'Error changing admin password.';
    res.redirect('/admin');
  }
});

// 18. Delete Admin Account Handler
app.post('/admin/delete-admin/:id', requireAdmin, async (req, res) => {
  try {
    const targetAdmin = await dbGet(`SELECT * FROM admins WHERE id = ?`, [req.params.id]);
    if (!targetAdmin) {
      req.session.error_msg = 'Admin account not found.';
      return res.redirect('/admin');
    }

    if (targetAdmin.username === req.session.adminUser) {
      req.session.error_msg = 'You cannot delete your own logged-in admin account!';
      return res.redirect('/admin');
    }

    const totalAdmins = await dbGet(`SELECT COUNT(*) as count FROM admins`);
    if (totalAdmins.count <= 1) {
      req.session.error_msg = 'Cannot delete the only admin account.';
      return res.redirect('/admin');
    }

    await dbRun(`DELETE FROM admins WHERE id = ?`, [req.params.id]);
    req.session.success_msg = `Admin account "${targetAdmin.username}" removed successfully.`;
    res.redirect('/admin');
  } catch (error) {
    console.error(error);
    req.session.error_msg = 'Error deleting admin.';
    res.redirect('/admin');
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`NDT අපි server running on http://localhost:${PORT}`);
});
