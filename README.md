# NDT අපි (NDT Us) — Alumni & Student Platform

This is a Node.js + Express + SQLite web platform designed for the **National Diploma in Technology (NDT)** student and alumni community. It enables community connection, batch-wise search of alumni profiles, lookups for Serial and Card/Index Numbers, and centralizes campus notifications and event schedules.

---

## Key Features

1. **Global Search**: Search through registered students by Name, Serial Number, or Card/Index Number.
2. **Advanced Filtering**: Filter alumni profiles by specific **Batch** and **Field of Study** (Civil, Electrical, Mechanical, Marine, Chemical, Textile, Polymer, IT, etc.).
3. **Self-Managed Profiles**: Alumni can register their own details, upload a profile photo, and secure modifications with a personal password chosen during registration.
4. **Campus Notices & Events**: A centralized noticeboard to view upcoming campus functions, news, and jobs.
5. **Admin Portal**: A dedicated administrative dashboard to review and approve registrations (preventing spam), delete profiles, and post campus notices with attachments.

---

## Installation & Running

Follow these steps to run the application on your computer:

### 1. Extract/Ensure Files
Verify that you have the following structure in your workspace:
- `package.json` (dependencies and start scripts)
- `server.js` (Express backend and routing)
- `db.js` (SQLite configuration)
- `views/` (EJS frontend templates)
- `public/uploads/` (User image assets)

### 2. Install Dependencies
Open your terminal (PowerShell, Command Prompt, or Git Bash) in this project folder and run:
```bash
npm install
```

### 3. Start the Server
Run the following command to start the application:
```bash
npm start
```
*Note: If you have `nodemon` installed globally, you can also use `npm run dev` to start in auto-reload development mode.*

### 4. Open in Browser
Once running, open your web browser and go to:
[http://localhost:3000](http://localhost:3000)

---

## Credentials for Administration

To access the Admin Portal (`/admin`) to approve profiles or post new notices, use the default credentials below:

- **Admin URL**: `http://localhost:3000/admin`
- **Username**: `admin`
- **Password**: `admin123`

*Tip: You can modify these credentials or add new administrators directly inside the `admins` table of the database (`ndt_api.db`) using any SQLite client or changing `db.js`'s defaults.*

---

## Technology Stack

- **Backend**: Node.js & Express.js
- **Database**: SQLite3 (Stores data locally in `ndt_api.db`)
- **Frontend Template**: EJS (Embedded JavaScript)
- **Styling**: Tailwind CSS (CDN-delivered, highly responsive)
- **Authentication**: Session-based (for admin) & Password hashing via `bcryptjs`
- **Uploads**: `multer` library for storing profile pictures and notice images

---

## Project Structure

```text
NDT/
├── package.json         # Project metadata and dependencies
├── server.js            # Main Express application & routing
├── db.js                # SQLite Database setup and CRUD utilities
├── ndt_api.db           # SQLite Database file (generated on first launch)
├── public/              # Static frontend assets
│   └── uploads/         # Directory where uploaded images are saved
├── views/               # HTML template files
│   ├── partials/
│   │   ├── header.ejs   # Navigation bar and document head
│   │   └── footer.ejs   # Footer and layout scripts
│   ├── index.ejs        # Homepage dashboard
│   ├── directory.ejs    # Alumni Search and Filtering page
│   ├── profile.ejs      # Single profile detail view
│   ├── register.ejs     # Create or edit profile forms
│   ├── notices.ejs      # Campus Noticeboard stream
│   └── admin.ejs        # Admin Login & Management Dashboard
└── README.md            # This documentation file
```
