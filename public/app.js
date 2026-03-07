document.addEventListener('DOMContentLoaded', () => {
    // -----------------------------------------
    // Auth Page Logic (index.html)
    // -----------------------------------------
    const loginBox = document.getElementById('loginBox');
    const registerBox = document.getElementById('registerBox');
    const showRegisterBtn = document.getElementById('showRegister');
    const showLoginBtn = document.getElementById('showLogin');

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    // Toggle Forms
    if (showRegisterBtn && showLoginBtn) {
        showRegisterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loginBox.classList.add('hidden');
            setTimeout(() => {
                loginBox.style.display = 'none';
                registerBox.style.display = 'block';
                setTimeout(() => registerBox.classList.remove('hidden'), 50);
            }, 500); // Wait for transition
        });

        showLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            registerBox.classList.add('hidden');
            setTimeout(() => {
                registerBox.style.display = 'none';
                loginBox.style.display = 'block';
                setTimeout(() => loginBox.classList.remove('hidden'), 50);
            }, 500);
        });
    }

    // Register Submission
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('regName').value;
            const email = document.getElementById('regEmail').value;
            const password = document.getElementById('regPassword').value;
            const role = document.getElementById('regRole').value;
            const errorDiv = document.getElementById('registerError');
            const successDiv = document.getElementById('registerSuccess');

            errorDiv.textContent = '';
            successDiv.textContent = '';

            try {
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password, role })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Registration failed');

                successDiv.textContent = 'Account created successfully! You can now log in.';
                registerForm.reset();
                setTimeout(() => showLoginBtn.click(), 2000);
            } catch (err) {
                errorDiv.textContent = err.message;
            }
        });
    }

    // Login Submission
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const errorDiv = document.getElementById('loginError');

            errorDiv.textContent = '';

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Login failed');

                localStorage.setItem('token', data.token);
                localStorage.setItem('userName', data.name);
                localStorage.setItem('role', data.role);
                window.location.href = '/dashboard.html';
            } catch (err) {
                errorDiv.textContent = err.message;
            }
        });
    }

    // -----------------------------------------
    // Dashboard Logic (dashboard.html)
    // -----------------------------------------
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        const userName = localStorage.getItem('userName') || 'User';
        const userRole = localStorage.getItem('role') || 'student';

        document.getElementById('userNameDisplay').textContent = `Welcome, ${userName}`;
        const dateDisplay = document.getElementById('dateDisplay');
        if (dateDisplay) {
            dateDisplay.textContent = new Date().toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
        }

        logoutBtn.addEventListener('click', () => {
            localStorage.clear();
            window.location.href = '/index.html';
        });

        // Display correct dashboard based on role
        if (userRole === 'teacher') {
            document.getElementById('teacherDashboard').style.display = 'grid';
            fetchTeacherRoster();
            setupAddStudentForm();
        } else {
            document.getElementById('studentDashboard').style.display = 'grid';
            const studentNameEl = document.getElementById('studentName');
            if (studentNameEl) studentNameEl.textContent = userName;

            const avatarCircle = document.querySelector('.avatar-circle');
            if (avatarCircle) avatarCircle.textContent = userName.charAt(0).toUpperCase();

            fetchStudentAttendance();
            setupStudentAttendanceButtons();
        }
    }

    // --- Teacher Specific Logic ---
    function setupAddStudentForm() {
        const form = document.getElementById('addStudentForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('newStudentName').value;
            const email = document.getElementById('newStudentEmail').value;
            const password = document.getElementById('newStudentPassword').value;
            const msgObj = document.getElementById('addStudentMsg');

            try {
                msgObj.textContent = 'Adding...';
                msgObj.style.color = 'var(--text-muted)';

                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password, role: 'student' })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Registration failed');

                msgObj.textContent = 'Student added successfully!';
                msgObj.style.color = 'var(--success-color)';
                form.reset();
                fetchTeacherRoster(); // refresh roster
                setTimeout(() => { msgObj.textContent = ''; }, 3000);
            } catch (err) {
                msgObj.textContent = err.message;
                msgObj.style.color = 'var(--danger-color)';
            }
        });
    }

    async function fetchTeacherRoster() {
        const token = localStorage.getItem('token');
        const tbody = document.getElementById('rosterRecords');
        if (!tbody) return;

        const today = new Date().toLocaleDateString('en-CA');

        try {
            const res = await fetch(`/api/teacher/dashboard?date=${today}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.status === 401 || res.status === 403) {
                localStorage.clear();
                window.location.href = '/index.html';
                return;
            }

            const data = await res.json();
            if (!res.ok) throw new Error('Failed to fetch roster');

            tbody.innerHTML = '';

            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">No students registered yet.</td></tr>`;
                return;
            }

            data.forEach(student => {
                const tr = document.createElement('tr');

                let statusClass = '';
                if (student.status === 'Present') statusClass = 'present';
                else if (student.status === 'Absent') statusClass = 'absent';

                const statusBadge = student.status === 'Unmarked' ?
                    `<span style="color:var(--text-muted);font-style:italic;">Unmarked</span>` :
                    `<span class="status-badge ${statusClass}">${student.status}</span>`;

                tr.innerHTML = `
                    <td style="font-weight:500;">${student.name}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="btn btn-sm success-btn" onclick="markStudentAttendance(${student.student_id}, 'Present')" style="margin-right:8px;">Present</button>
                        <button class="btn btn-sm danger-btn" onclick="markStudentAttendance(${student.student_id}, 'Absent')">Absent</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--danger-color)">Error loading roster.</td></tr>`;
        }
    }

    window.markStudentAttendance = async function (studentId, status) {
        const token = localStorage.getItem('token');
        const actionMsg = document.getElementById('actionMsg');
        const today = new Date().toLocaleDateString('en-CA');

        try {
            actionMsg.textContent = 'Updating...';
            actionMsg.style.color = 'var(--text-muted)';

            const res = await fetch('/api/attendance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ student_id: studentId, status, date: today })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to mark attendance');

            actionMsg.textContent = `Marked student as ${status}.`;
            actionMsg.style.color = status === 'Present' ? 'var(--success-color)' : 'var(--danger-color)';

            setTimeout(() => { actionMsg.textContent = ''; }, 3000);

            fetchTeacherRoster();
        } catch (err) {
            actionMsg.textContent = err.message;
            actionMsg.style.color = 'var(--danger-color)';
        }
    };

    // --- Student Specific Logic ---
    function setupStudentAttendanceButtons() {
        const markPresentBtn = document.getElementById('markPresentBtn');
        const markAbsentBtn = document.getElementById('markAbsentBtn');

        if (markPresentBtn && markAbsentBtn) {
            markPresentBtn.addEventListener('click', () => markAttendanceSelf('Present'));
            markAbsentBtn.addEventListener('click', () => markAttendanceSelf('Absent'));
        }
    }

    async function markAttendanceSelf(status) {
        const token = localStorage.getItem('token');
        const actionMsg = document.getElementById('studentActionMsg');
        const today = new Date().toLocaleDateString('en-CA');

        try {
            actionMsg.textContent = 'Updating...';

            const res = await fetch('/api/attendance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                // student_id is omitted; backend uses req.user.userId
                body: JSON.stringify({ status, date: today })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to mark attendance');

            actionMsg.textContent = `Successfully marked as ${status} for today.`;
            actionMsg.style.color = status === 'Present' ? 'var(--success-color)' : 'var(--danger-color)';

            fetchStudentAttendance(); // Refresh list
        } catch (err) {
            actionMsg.textContent = err.message;
            actionMsg.style.color = 'var(--danger-color)';
        }
    }

    async function fetchStudentAttendance() {
        const token = localStorage.getItem('token');
        const tbody = document.getElementById('attendanceRecords');
        if (!tbody) return;

        try {
            const res = await fetch('/api/attendance', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.status === 401 || res.status === 403) {
                localStorage.clear();
                window.location.href = '/index.html';
                return;
            }

            const data = await res.json();
            if (!res.ok) throw new Error('Failed to fetch records');

            tbody.innerHTML = '';

            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;color:var(--text-muted)">No attendance records found.</td></tr>`;
                return;
            }

            data.forEach(record => {
                const tr = document.createElement('tr');
                const dateRaw = new Date(record.record_date);
                const formattedDate = dateRaw.toLocaleDateString('en-US', {
                    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                });

                const statusClass = record.status === 'Present' ? 'present' : 'absent';

                tr.innerHTML = `
                    <td>${formattedDate}</td>
                    <td><span class="status-badge ${statusClass}">${record.status}</span></td>
                `;
                tbody.appendChild(tr);
            });

        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;color:var(--danger-color)">Error loading records.</td></tr>`;
        }
    }
});
