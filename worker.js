// Cloudflare Worker for Class Management System

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Router
    if (path === '/' && request.method === 'GET') {
      return new Response(homePage(), { headers: { 'Content-Type': 'text/html' } });
    }
    
    if (path === '/teacher' && request.method === 'GET') {
      return new Response(teacherPage(), { headers: { 'Content-Type': 'text/html' } });
    }
    
    if (path === '/student' && request.method === 'GET') {
      return new Response(studentPage(), { headers: { 'Content-Type': 'text/html' } });
    }
    
    if (path === '/api/create-class' && request.method === 'POST') {
      return await handleCreateClass(request, env);
    }
    
    if (path === '/api/verify-code' && request.method === 'POST') {
      return await handleVerifyCode(request, env);
    }
    
    if (path === '/api/submit-response' && request.method === 'POST') {
      return await handleSubmitResponse(request, env);
    }

    return new Response('Not Found', { status: 404 });
  }
};

// Generate random 6-character alphanumeric code
function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Handle class creation
async function handleCreateClass(request, env) {
  try {
    const data = await request.json();
    const { email, className } = data;

    if (!email || !className) {
      return new Response(JSON.stringify({ error: 'Email and class name are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate unique code
    let code = generateCode();
    let exists = await env.CLASS_DATA.get(code);
    
    // Ensure code is unique
    while (exists) {
      code = generateCode();
      exists = await env.CLASS_DATA.get(code);
    }

    // Store class data
    const classData = {
      code,
      email,
      className,
      createdAt: new Date().toISOString(),
      responses: []
    };

    await env.CLASS_DATA.put(code, JSON.stringify(classData));

    return new Response(JSON.stringify({ success: true, code, className }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to create class' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle code verification
async function handleVerifyCode(request, env) {
  try {
    const data = await request.json();
    const { code } = data;

    if (!code) {
      return new Response(JSON.stringify({ error: 'Code is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const classData = await env.CLASS_DATA.get(code);
    
    if (!classData) {
      return new Response(JSON.stringify({ error: 'Invalid code' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const parsed = JSON.parse(classData);
    return new Response(JSON.stringify({ 
      success: true, 
      className: parsed.className 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to verify code' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle student response submission
async function handleSubmitResponse(request, env) {
  try {
    const data = await request.json();
    const { code, studentEmail, response } = data;

    if (!code || !studentEmail || !response) {
      return new Response(JSON.stringify({ error: 'All fields are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const classData = await env.CLASS_DATA.get(code);
    
    if (!classData) {
      return new Response(JSON.stringify({ error: 'Invalid code' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const parsed = JSON.parse(classData);
    
    // Add student response
    parsed.responses.push({
      studentEmail,
      response,
      submittedAt: new Date().toISOString()
    });

    // Update class data
    await env.CLASS_DATA.put(code, JSON.stringify(parsed));

    // Send email to teacher with spreadsheet
    await sendEmailToTeacher(parsed, env);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to submit response' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Send email to teacher (you'll need to configure with your email service)
async function sendEmailToTeacher(classData, env) {
  // Generate CSV content
  let csvContent = 'Student Email,Response,Submitted At\n';
  classData.responses.forEach(resp => {
    csvContent += `"${resp.studentEmail}","${resp.response.replace(/"/g, '""')}","${resp.submittedAt}"\n`;
  });

  // If you're using Mailgun
  if (env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN) {
    const formData = new FormData();
    formData.append('from', `Class System <noreply@${env.MAILGUN_DOMAIN}>`);
    formData.append('to', classData.email);
    formData.append('subject', `New Response for ${classData.className}`);
    formData.append('text', `A new response has been submitted for your class "${classData.className}".\n\nTotal responses: ${classData.responses.length}\n\nSee attached spreadsheet for details.`);
    formData.append('attachment', new Blob([csvContent], { type: 'text/csv' }), `${classData.className}-responses.csv`);

    await fetch(`https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}`
      },
      body: formData
    });
  }
  
  // Note: You can also use SendGrid, Resend, or other email services
  // Configure the appropriate environment variables and update this function
}

// HTML Templates
function homePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Class Management System</title>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Roboto', sans-serif;
            background: white;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        h1 {
            color: #1e40af;
            margin-bottom: 40px;
            font-size: 2.5rem;
        }
        .button-group {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        a {
            display: block;
            padding: 20px 40px;
            border: 2px solid black;
            background: white;
            color: black;
            text-decoration: none;
            font-size: 1.2rem;
            font-weight: 500;
            transition: all 0.3s ease;
        }
        a:hover {
            background: #1e40af;
            color: white;
            border-color: #1e40af;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Class Management System</h1>
        <div class="button-group">
            <a href="/teacher">Teacher Portal</a>
            <a href="/student">Student Portal</a>
        </div>
    </div>
</body>
</html>`;
}

function teacherPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Teacher Portal</title>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Roboto', sans-serif;
            background: white;
            padding: 40px 20px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
        }
        h1 {
            color: #1e40af;
            margin-bottom: 30px;
            text-align: center;
        }
        .back-link {
            display: inline-block;
            margin-bottom: 20px;
            color: #1e40af;
            text-decoration: none;
        }
        .back-link:hover {
            text-decoration: underline;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #1e40af;
        }
        input {
            width: 100%;
            padding: 12px;
            border: 2px solid black;
            font-size: 1rem;
            font-family: 'Roboto', sans-serif;
        }
        input:focus {
            outline: none;
            border-color: #1e40af;
        }
        button {
            width: 100%;
            padding: 15px;
            border: 2px solid black;
            background: white;
            color: black;
            font-size: 1.1rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            font-family: 'Roboto', sans-serif;
        }
        button:hover {
            background: #1e40af;
            color: white;
            border-color: #1e40af;
        }
        .success-message {
            margin-top: 30px;
            padding: 20px;
            border: 2px solid black;
            display: none;
        }
        .success-message.active {
            display: block;
        }
        .success-message h2 {
            color: #1e40af;
            margin-bottom: 15px;
        }
        .code-display {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 15px;
        }
        .code {
            flex: 1;
            padding: 15px;
            border: 2px solid black;
            font-size: 1.5rem;
            font-weight: 700;
            text-align: center;
            letter-spacing: 2px;
        }
        .copy-btn {
            padding: 15px 25px;
            width: auto;
        }
        .error-message {
            color: #dc2626;
            margin-top: 10px;
            display: none;
        }
        .error-message.active {
            display: block;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← Back to Home</a>
        <h1>Create a Class</h1>
        
        <form id="createClassForm">
            <div class="form-group">
                <label for="email">Teacher Email</label>
                <input type="email" id="email" required>
            </div>
            
            <div class="form-group">
                <label for="className">Class Name</label>
                <input type="text" id="className" required>
            </div>
            
            <button type="submit">Create Class</button>
            <div class="error-message" id="errorMessage"></div>
        </form>
        
        <div class="success-message" id="successMessage">
            <h2 id="successText"></h2>
            <p>Please copy the code below:</p>
            <div class="code-display">
                <div class="code" id="classCode"></div>
                <button class="copy-btn" onclick="copyCode()">Copy</button>
            </div>
        </div>
    </div>
    
    <script>
        document.getElementById('createClassForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const className = document.getElementById('className').value;
            const errorMessage = document.getElementById('errorMessage');
            const successMessage = document.getElementById('successMessage');
            
            errorMessage.classList.remove('active');
            successMessage.classList.remove('active');
            
            try {
                const response = await fetch('/api/create-class', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, className })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('successText').textContent = 
                        data.className + ' has been created.';
                    document.getElementById('classCode').textContent = data.code;
                    successMessage.classList.add('active');
                    document.getElementById('createClassForm').reset();
                } else {
                    errorMessage.textContent = data.error || 'Failed to create class';
                    errorMessage.classList.add('active');
                }
            } catch (error) {
                errorMessage.textContent = 'An error occurred. Please try again.';
                errorMessage.classList.add('active');
            }
        });
        
        function copyCode() {
            const code = document.getElementById('classCode').textContent;
            navigator.clipboard.writeText(code).then(() => {
                alert('Code copied to clipboard!');
            });
        }
    </script>
</body>
</html>`;
}

function studentPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Student Portal</title>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Roboto', sans-serif;
            background: white;
            padding: 40px 20px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
        }
        h1 {
            color: #1e40af;
            margin-bottom: 30px;
            text-align: center;
        }
        .back-link {
            display: inline-block;
            margin-bottom: 20px;
            color: #1e40af;
            text-decoration: none;
        }
        .back-link:hover {
            text-decoration: underline;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #1e40af;
        }
        input, textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid black;
            font-size: 1rem;
            font-family: 'Roboto', sans-serif;
        }
        textarea {
            min-height: 150px;
            resize: vertical;
        }
        input:focus, textarea:focus {
            outline: none;
            border-color: #1e40af;
        }
        button {
            width: 100%;
            padding: 15px;
            border: 2px solid black;
            background: white;
            color: black;
            font-size: 1.1rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            font-family: 'Roboto', sans-serif;
        }
        button:hover {
            background: #1e40af;
            color: white;
            border-color: #1e40af;
        }
        .class-name {
            padding: 15px;
            border: 2px solid black;
            margin-bottom: 20px;
            text-align: center;
            font-size: 1.2rem;
            font-weight: 500;
            display: none;
        }
        .class-name.active {
            display: block;
        }
        .submission-form {
            display: none;
        }
        .submission-form.active {
            display: block;
        }
        .error-message, .success-message {
            margin-top: 10px;
            padding: 10px;
            display: none;
        }
        .error-message {
            color: #dc2626;
        }
        .error-message.active, .success-message.active {
            display: block;
        }
        .success-message {
            color: #16a34a;
            border: 2px solid #16a34a;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← Back to Home</a>
        <h1>Student Submission</h1>
        
        <form id="codeForm">
            <div class="form-group">
                <label for="code">Enter Class Code</label>
                <input type="text" id="code" required maxlength="6" style="text-transform: uppercase;">
            </div>
            <button type="submit">Verify Code</button>
            <div class="error-message" id="codeError"></div>
        </form>
        
        <div class="class-name" id="classNameDisplay"></div>
        
        <div class="submission-form" id="submissionForm">
            <form id="responseForm">
                <div class="form-group">
                    <label for="studentEmail">Your Email</label>
                    <input type="email" id="studentEmail" required>
                </div>
                
                <div class="form-group">
                    <label for="response">Your Response</label>
                    <textarea id="response" required></textarea>
                </div>
                
                <button type="submit">Submit Response</button>
                <div class="error-message" id="submitError"></div>
                <div class="success-message" id="submitSuccess"></div>
            </form>
        </div>
    </div>
    
    <script>
        let verifiedCode = null;
        
        document.getElementById('codeForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const code = document.getElementById('code').value.toUpperCase();
            const codeError = document.getElementById('codeError');
            const classNameDisplay = document.getElementById('classNameDisplay');
            const submissionForm = document.getElementById('submissionForm');
            
            codeError.classList.remove('active');
            
            try {
                const response = await fetch('/api/verify-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    verifiedCode = code;
                    classNameDisplay.textContent = 'Class: ' + data.className;
                    classNameDisplay.classList.add('active');
                    submissionForm.classList.add('active');
                    document.getElementById('codeForm').style.display = 'none';
                } else {
                    codeError.textContent = data.error || 'Invalid code';
                    codeError.classList.add('active');
                }
            } catch (error) {
                codeError.textContent = 'An error occurred. Please try again.';
                codeError.classList.add('active');
            }
        });
        
        document.getElementById('responseForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const studentEmail = document.getElementById('studentEmail').value;
            const response = document.getElementById('response').value;
            const submitError = document.getElementById('submitError');
            const submitSuccess = document.getElementById('submitSuccess');
            
            submitError.classList.remove('active');
            submitSuccess.classList.remove('active');
            
            try {
                const res = await fetch('/api/submit-response', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        code: verifiedCode, 
                        studentEmail, 
                        response 
                    })
                });
                
                const data = await res.json();
                
                if (data.success) {
                    submitSuccess.textContent = 'Response submitted successfully!';
                    submitSuccess.classList.add('active');
                    document.getElementById('responseForm').reset();
                } else {
                    submitError.textContent = data.error || 'Failed to submit response';
                    submitError.classList.add('active');
                }
            } catch (error) {
                submitError.textContent = 'An error occurred. Please try again.';
                submitError.classList.add('active');
            }
        });
    </script>
</body>
</html>`;
}
