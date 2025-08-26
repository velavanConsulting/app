require('dotenv').config();

const path = require('path');

const mysql = require('mysql2');

const bcrypt = require('bcryptjs');

const PDFDocument = require('pdfkit');

const PDFTable = require('pdfkit-table');

const moment = require('moment');

const session = require('express-session');

// BackUp

const fs = require("fs");

const { Parser } = require("json2csv");

const { google } = require('googleapis');

const readline = require('readline');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKEN_PATH = 'token.json';


const db = mysql.createPool({
  host: process.env.tidb_DB_HOST,
  user: process.env.tidb_DB_USER,
  password: process.env.tidb_DB_PASS,
  database: process.env.tidb_DB_NAME,
  port: process.env.tidb_DB_PORT || 4000,
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  }
});

exports.log = (req, res) => {
  db.connect((err) => {
    if (err) {
      console.log("MySQL connection failed ❌", err);
    } else {
      console.log("Connected to local host MySQL ✅");
    }
  });
}

exports.table = (req, res) => {
  const alert = req.query.alert;

  const query = `SELECT * FROM clients`;

  db.query(query, (err, result) => {
    if (err) {
      console.error("Error fetching table:", err);
      return res.status(500).send("Internal Server Error");
    }

    if (result.length === 0) {
      // return res.status(404).send("Data not found");
      return res.render("TableDesign", {
        clients: [],
        message: `Data not found`,
        s: "No Data"
      });
    }

    // Format dates
    const formattedClients = result.map(client => {
      return {
        ...client,
        fc_expiry_date: formatDate(client.fc_expiry_date),
        np: formatDate(client.np),
        permit: formatDate(client.permit),
        road_tax: formatDate(client.road_tax),
		road_tax_amt : road_tax_amount,
        created_at: formatDateTime(client.created_at),
        modified_at: formatDateTime(client.modified_at),

        // yyyy-mm-dd for <input type="date">
        fc_expiry_date_input: formatYMD(client.fc_expiry_date),
        np_input: formatYMD(client.np),
        permit_input: formatYMD(client.permit),
	      road_tax_input: formatYMD(client.road_tax)
      };
    });



    const clients = result;
    res.render('TableDesign', { clients: formattedClients, alert });
  });
}

exports.search = (req, res) => {
  const search = req.body.search_query?.trim();

  // If no search input is provided
  if (!search) {
    return res.render("TableDesign", {
      clients: [],
      message: "Please enter a search term."
    });
  }

  // Query: wildcard for client_name, exact for phone & vehicle_number
  const query = `
    SELECT * FROM clients
    WHERE client_name LIKE ?
       OR company LIKE ?
       OR phone = ?
       OR vehicle_number = ?
  `;

  // Values: client_name with %, others exact
  const values = [`%${search}%`, `%${search}%`, search, search];

  db.query(query, values, (err, result) => {
    if (err) {
      console.error("Error fetching table:", err);
      return res.status(500).send("Internal Server Error");
    }

    if (result.length === 0) {
      return res.render("TableDesign", {
        clients: [],
        message: `No results found for "${search}".`,
        s: search
      });
    }

    // Format dates
    const formattedClients = result.map(client => ({
      ...client,
      fc_expiry_date: formatDate(client.fc_expiry_date),
      np: formatDate(client.np),
      permit: formatDate(client.permit),
      road_tax: formatDate(client.road_tax),
      road_tax_amt : road_tax_amount,
	  created_at: formatDateTime(client.created_at),
      modified_at: formatDateTime(client.modified_at),

      // yyyy-mm-dd for <input type="date">
      fc_expiry_date_input: formatYMD(client.fc_expiry_date),
      np_input: formatYMD(client.np),
      permit_input: formatYMD(client.permit),
	  road_tax_input: formatYMD(client.road_tax)

      
    }));

    res.render('TableDesign', {
      clients: formattedClients,
      s: search
    });
  });
};

exports.gr = (req, res) => {
  const PDFDocument = require('pdfkit');
  const moment = require('moment');
  const { from_date, to_date, columns } = req.body;
  const selectedColumns = Array.isArray(columns) ? columns : [columns];

  if (!from_date || !to_date || selectedColumns.length === 0) {
    return res.status(400).send('Invalid request');
  }

  const columnString = selectedColumns.map(col => `\`${col}\``).join(', ');

  // --- Determine Filtering and Ordering Logic ---
  const expiryFields = ['fc_expiry_date', 'permit', 'np'];
  const nameFields = ['client_name', 'company'];
  const selectedExpiryFields = expiryFields.filter(field => selectedColumns.includes(field));
  const selectedNameFields = nameFields.filter(field => selectedColumns.includes(field));

  let filterColumn = '';
  let orderBy = '';

  if (selectedExpiryFields.length > 0) {
    // Prefer fc_expiry_date if present
    filterColumn = selectedExpiryFields.includes('fc_expiry_date')
      ? 'fc_expiry_date'
      : selectedExpiryFields[0];

    orderBy = `ORDER BY \`${filterColumn}\` ASC`;
  } else {
    filterColumn = 'created_at';

    if (selectedColumns.includes('company')) {
      orderBy = 'ORDER BY `company` ASC';
    } else if (selectedColumns.includes('client_name')) {
      orderBy = 'ORDER BY `client_name` ASC';
    } else {
      orderBy = 'ORDER BY `created_at` ASC';
    }
  }

  const query = `
    SELECT ${columnString}
    FROM clients
    WHERE \`${filterColumn}\` BETWEEN ? AND ?
    ${orderBy}
  `;

  db.query(query, [from_date, to_date], (err, results) => {
    if (err) {
      console.error('MySQL Error:', err);
      return res.status(500).send('Database Error');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=client_report.pdf');

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'portrait' });
    doc.pipe(res);

    const marginLeft = doc.page.margins.left;
    const marginRight = doc.page.margins.right;
    const marginTop = doc.page.margins.top;
    const marginBottom = doc.page.margins.bottom;

    const usableWidth = doc.page.width - marginLeft - marginRight;
    const sNoWidth = 40;
    const otherColWidth = (usableWidth - sNoWidth) / selectedColumns.length;
    const tableTop = marginTop + 10;
    let y = tableTop;

    // --- Date Format Helper ---
    function formatDate(date) {
      return new Date(date).toLocaleDateString('en-GB'); // dd/mm/yyyy
    }

    // --- Drawing Helpers ---
    function drawCell(text, x, y, width, height, isHeader = false) {
      doc.rect(x, y, width, height).stroke();
      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
      doc.text(text, x + 5, y + 5, {
        width: width - 10,
        align: 'left'
      });
    }

    function drawRow(data, y, isHeader = false) {
      let x = marginLeft;
      const cells = [
        isHeader ? 'S.No' : data.index.toString(),
        ...selectedColumns.map(col => {
          // if (isHeader) return col.replace(/_/g, ' ').toUpperCase();
          if (isHeader) {
            if (col === 'client_name') return 'OWNER NAME';
            return col.replace(/_/g, ' ').toUpperCase();
          }
          const val = data[col];
          return val instanceof Date ? formatDate(val) : val || '';
        })
      ];

      const cellHeights = cells.map((text, i) => {
        const width = i === 0 ? sNoWidth : otherColWidth;
        return doc.heightOfString(text.toString(), {
          width: width - 10,
          align: 'left'
        });
      });

      const rowHeight = Math.max(...cellHeights) + 10;

      cells.forEach((text, i) => {
        const width = i === 0 ? sNoWidth : otherColWidth;
        drawCell(text.toString(), x, y, width, rowHeight, isHeader);
        x += width;
      });

      return rowHeight;
    }

    function calculateRowHeight(data) {
      const cells = [
        data.index.toString(),
        ...selectedColumns.map(col => {
          const val = data[col];
          return val instanceof Date ? formatDate(val) : val || '';
        })
      ];

      const heights = cells.map((text, i) => {
        const width = i === 0 ? sNoWidth : otherColWidth;
        return doc.heightOfString(text.toString(), {
          width: width - 10,
          align: 'left'
        });
      });

      return Math.max(...heights) + 10;
    }

    // --- PDF Table Content ---
    y = tableTop;

    const headerHeight = drawRow({}, y, true);
    y += headerHeight;

    results.forEach((row, index) => {
      const rowData = { ...row, index: index + 1 };
      const rowHeight = calculateRowHeight(rowData);

      if (y + rowHeight > doc.page.height - marginBottom) {
        doc.addPage({ layout: 'portrait' });
        y = tableTop;
        const headerHeight = drawRow({}, y, true);
        y += headerHeight;
      }

      const drawnHeight = drawRow(rowData, y);
      y += drawnHeight;
    });

    doc.end();
  });
};

exports.loadNotifications = (req, res) => {
  const today = moment().startOf('day').format('YYYY-MM-DD');

  // Individual thresholds
  const fcThreshold = moment().add(7, 'days').format('YYYY-MM-DD');
  const permitThreshold = moment().add(30, 'days').format('YYYY-MM-DD');
  const npThreshold = moment().add(5, 'days').format('YYYY-MM-DD');

  const query = `
    SELECT client_name, phone, company, vehicle_number, 
           DATE_FORMAT(fc_expiry_date, '%Y-%m-%d') as fc_expiry_date,
           DATE_FORMAT(np, '%Y-%m-%d') as np_expiry_date,
           DATE_FORMAT(permit, '%Y-%m-%d') as permit_expiry_date
    FROM clients
    WHERE (fc_expiry_date BETWEEN ? AND ? OR fc_expiry_date < ?)
       OR (np BETWEEN ? AND ? OR np < ?)
       OR (permit BETWEEN ? AND ? OR permit < ?)
  `;

  db.query(
    query,
    [
      today, fcThreshold, today, // FC
      today, npThreshold, today, // NP
      today, permitThreshold, today // Permit
    ],
    (err, results) => {
      if (err) {
        console.error('Notification Fetch Error:', err);
        return res.status(500).json({ error: 'Server error while fetching notifications.' });
      }

      const notifications = results.flatMap(client => {
        const list = [];

        const checkAndPush = (type, expiry, thresholdDays) => {
          if (!expiry) return;

          const expiryMoment = moment(expiry, 'YYYY-MM-DD');
          const daysLeft = expiryMoment.diff(moment(), 'days');

          if (daysLeft <= thresholdDays) {
            let statusText = '';
            let statusClass = '';

            if (daysLeft < 0) {
              statusText = 'Expired!';
              statusClass = 'text-danger fw-bold';
            } else if (daysLeft === 0) {
              statusText = 'Expires Today!';
              statusClass = 'text-warning fw-bold';
            } else {
              statusText = `Expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`;
              statusClass = 'text-primary fw-bold';
            }

            list.push({
              type,
              expiry_date: formatDate(expiry),
              days_left: daysLeft,
              status_text: statusText,
              status_class: statusClass,
              client_name: client.client_name,
              phone: client.phone,
              vehicle_number: client.vehicle_number,
              company: client.company
            });
          }
        };

        checkAndPush('FC', client.fc_expiry_date, 7);
        checkAndPush('NP', client.np_expiry_date, 5);
        checkAndPush('Permit', client.permit_expiry_date, 30);

        return list;
      });

      // Sort soonest first (expired first, then nearest expiry)
      notifications.sort((a, b) => a.days_left - b.days_left);

      res.render('notification', { notifications });
    }
  );
};


exports.sendWhatsAppNotification = (req, res) => {
  const { name, phone, vehicle, company, type, date } = req.query;

  //const message = `Hello ${name},\n\nThis is a reminder that your vehicle ${vehicle} (${type}) is expiring on ${date}. Please renew it on time.\n\nThank you!\n- ${company}`;
  //const message = `வணக்கம் ${name},\n\nஉங்கள் வாகனம் ${vehicle} (${type}) ${date} அன்று காலாவதி ஆகிறது. தயவுசெய்து அதை நேரத்திற்கு முன்னே புதுப்பிக்கவும்.\n\nநன்றி!\n- ${company}`;
  const message = `*ஸ்ரீ வேலவன் ஆட்டோ கன்சல்டிங்* \n\nவணக்கம் *${name}*,\n\nஉங்கள் வாகனம் *${vehicle}* (${type}) ${date} அன்று காலாவதி ஆகிறது. தயவுசெய்து அதை நேரத்திற்கு முன்னே புதுப்பிக்கவும்.\n\nநன்றி!`;
	const whatsappLink = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;

  res.redirect(whatsappLink);
};

exports.addClient = (req, res) => {
  const {
    client_name,
    phone,
    company,
    vehicle_number,
    vehicle_type,
    fc_expiry_date,
    np,
    permit,
    road_tax,
	road_tax_amt,
    notes
  } = req.body;

  const checkQuery = `SELECT * FROM clients WHERE vehicle_number = ?`;
  db.query(checkQuery, [vehicle_number], (err, results) => {
    if (err) {
      console.error("Error checking vehicle:", err);
      return res.redirect('/table?alert=error');
    }

    if (results.length > 0) {
      return res.redirect('/table?alert=exists');
    }

    const insertQuery = `
      INSERT INTO clients 
      (client_name, phone, company, vehicle_number, vehicle_type, fc_expiry_date, np, permit, road_tax, road_tax_amount, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      client_name,
      phone,
      company,
      vehicle_number,
      vehicle_type,
      fc_expiry_date,
      np,
      permit,
      road_tax,
	  road_tax_amt,
      notes
    ];

    db.query(insertQuery, values, (err, result) => {
      if (err) {
        console.error("Error inserting client:", err);
        return res.redirect('/table?alert=error');
      }

      return res.redirect('/table?alert=success');
    });
  });
};

exports.editClient = (req, res) => {
  const {
    id,
    client_name,
    phone,
    company,
    vehicle_number,
    vehicle_type,
    fc_expiry_date,
    np,
    permit,
    road_tax,
	road_tax_amt,
    notes
  } = req.body;


  const updateQuery = `
    UPDATE clients
    SET client_name = ?, phone = ?, company = ?, vehicle_type = ?,
    fc_expiry_date = ?, np = ?, permit = ?, road_tax = ?, road_tax_amount= ?, notes = ?, modified_at = NOW()
    WHERE id = ?
  `;

  const values = [
    client_name,
    phone,
    company,
    vehicle_type,
    fc_expiry_date,
    np,
    permit,
    road_tax,
	road_tax_amt,
    notes,
    id
  ];

  db.query(updateQuery, values, (err, result) => {
    if (err) {
      console.error("Error updating client:", err);
      return res.redirect('/table?alert=error');
    }

    console.log("Client updated successfully.");

    res.redirect('/table?alert=updated');
  });
};

exports.deleteClient = (req, res) => {
  const vehicleNumbers = req.body.vehicle_ids;
  if (!vehicleNumbers) {
    return res.redirect('/table?alert=nodata');
  }
  const idsArray = Array.isArray(vehicleNumbers) ? vehicleNumbers : [vehicleNumbers];

  const query = `DELETE FROM clients WHERE vehicle_number IN (?)`;

  db.query(query, [idsArray], (err, result) => {
    if (err) {
      console.error("Error deleting clients:", err);
      return res.redirect('/table?alert=error');
    }

    console.log("Deleted clients:", idsArray);
    res.redirect('/table?alert=deleted');
  });
};

exports.admin = (req, res) => {
  const adminId = req.session.adminId;

  if (!adminId) {
    return res.redirect('/?alert=unauthorized');
  }

  const totalQuery = `SELECT COUNT(*) AS total FROM clients`;
  const yesterdayQuery = `SELECT COUNT(*) AS yesterday FROM clients WHERE DATE(created_at) = CURDATE() - INTERVAL 1 DAY`;
  const modifiedQuery = `SELECT COUNT(*) AS modified FROM clients WHERE DATE(modified_at) = CURDATE()`;
  const allClientsQuery = `SELECT * FROM employee`;
  const adminInfoQuery = `SELECT name, email FROM admin WHERE id = ?`;

  db.query(totalQuery, (err, totalResult) => {
    if (err) return res.status(500).send("Total query error");

    db.query(yesterdayQuery, (err, yResult) => {
      if (err) return res.status(500).send("Yesterday query error");

      db.query(modifiedQuery, (err, mResult) => {
        if (err) return res.status(500).send("Modified query error");

        db.query(allClientsQuery, (err, employeeResult) => {
          if (err) return res.status(500).send("All clients query error");

          db.query(adminInfoQuery, [adminId], (err, adminInfoResult) => {
            if (err || adminInfoResult.length === 0) {
              return res.status(500).send("Admin info query error");
            }

            const stats = {
              totalClients: totalResult[0].total,
              newYesterday: yResult[0].yesterday,
              modifiedToday: mResult[0].modified,
            };

            const admin = adminInfoResult[0];

            res.render('admin', {
              stats,
              emp: employeeResult,
              adminName: admin.name,
              adminEmail: admin.email
            });
          });
        });
      });
    });
  });
};

exports.login = (req, res) => {
  console.log("Login requested.");
  const { email, password } = req.body;

  if (!email || !password) {
    return res.redirect('/?alert=empty');
  }

  // Step 1: Try finding the user in the admin table
  const adminQuery = `SELECT * FROM admin WHERE email = ? LIMIT 1`;

  db.query(adminQuery, [email], (err, adminResult) => {
    if (err) {
      console.error("Error querying admin table:", err);
      return res.redirect('/?alert=error');
    }

    if (adminResult.length > 0) {
      const admin = adminResult[0];

      // Compare passwords (if hashed)
      bcrypt.compare(password, admin.password, (err, isMatch) => {
        if (err || !isMatch) {
          return res.redirect('/?alert=invalid');
        }

        // Login successful as admin
        req.session.userType = 'admin';
        req.session.adminId = admin.id;
        return res.redirect('/home');
      });


    } else {
      // Step 2: Try finding the user in the employee table
      const empQuery = `SELECT * FROM employee WHERE email = ? LIMIT 1`;

      db.query(empQuery, [email], (err, empResult) => {
        if (err) {
          console.error("Error querying employee table:", err);
          return res.redirect('/?alert=error');
        }

        if (empResult.length === 0) {
          return res.redirect('/?alert=invalid');
        }

        const employee = empResult[0];
        // Compare passwords (hashed)
        bcrypt.compare(password, employee.password, (err, isMatch) => {
          if (err || !isMatch) {
            return res.redirect('/?alert=invalid');
          }

          // Login successful as employee
          req.session.userType = 'employee';
          req.session.empId = employee.id;
          return res.redirect('/home');
        });
      });
    }
  });
};

exports.AddEmployee = (req, res) => {

  const { emp_name, emp_email, emp_password } = req.body;

  if (!emp_name || !emp_email || !emp_password) {
    return res.redirect('/?alert=empty');
  }

  // Hash the password
  bcrypt.hash(emp_password, 10, (err, hashedPassword) => {
    if (err) {
      console.error("Error hashing password:", err);
      return res.redirect('/admin?add_alrt=error');
    }

    const query = `INSERT INTO employee (name, email, password) VALUES (?, ?, ?)`;

    db.query(query, [emp_name, emp_email, hashedPassword], (err, result) => {
      if (err) {
        console.error("Error adding employee:", err);
        return res.redirect('/admin?add_alrt=error');
      }

      console.log("Employee added successfully with hashed password");
      res.redirect('/admin?add_alrt=added');
    });
  });
};

exports.DeleteEmployee = (req, res) => {

  const email = req.body.email;

  if (!email) {
    return res.redirect('/admin?alert=noemail');
  }

  const query = `DELETE FROM employee WHERE email = ?`;

  db.query(query, [email], (err, result) => {
    if (err) {
      console.error("Error deleting employee:", err);
      return res.redirect('/admin?alert=error');
    }
    res.redirect('/admin?alert=deleted');
  });
};

exports.ChangePassword = (req, res) => {
  const { current_password, new_password } = req.body;

  // Assuming admin is logged in and session has admin ID
  const adminId = req.session.adminId;

  if (!adminId) {
    return res.redirect('/?alert=sessionexpired');
  }

  if (!current_password || !new_password) {
    return res.redirect('/admin?alert=empty');
  }

  const query = `SELECT * FROM admin WHERE id = ? LIMIT 1`;

  db.query(query, [adminId], async (err, result) => {
    if (err) {
      console.error("Error fetching admin:", err);
      return res.redirect('/admin?alert=error');
    }

    if (result.length === 0) {
      return res.redirect('/admin?alert=notfound');
    }

    const admin = result[0];

    // Compare current password with stored one
    const match = await bcrypt.compare(current_password, admin.password);
    if (!match) {
      return res.redirect('/admin?alert=wrongcurrent');
    }

    // Encrypt and update new password
    const hashedNewPassword = await bcrypt.hash(new_password, 10);
    const updateQuery = `UPDATE admin SET password = ? WHERE id = ?`;

    db.query(updateQuery, [hashedNewPassword, adminId], (updateErr, updateRes) => {
      if (updateErr) {
        console.error("Error updating password:", updateErr);
        return res.redirect('/admin?alert=updatefail');
      }
      return res.redirect('/admin?alert=updated');
    });
  });
};

exports.ChangeEmail = (req, res) => {

  const { new_email } = req.body;
  const adminId = req.session.adminId;

  // Check if the admin is logged in
  if (!adminId) {
    return res.redirect('/?alert=sessionexpired');
  }

  // Validate input
  if (!new_email) {
    return res.redirect('/admin?alert=empty');
  }

  // Update query
  const updateQuery = `UPDATE admin SET email = ? WHERE id = ?`;

  db.query(updateQuery, [new_email, adminId], (err, result) => {
    if (err) {
      console.error("Error updating admin email:", err);
      return res.redirect('/admin?alert=updatefail');
    }

    return res.redirect('/admin?alert=emailupdated');
  });
};

exports.emp = (req, res) => {
  empID = req.session.empId;

  if (!empID) {
    return res.redirect('/index'); // Not logged in or no session
  }

  const query = 'SELECT * FROM employee WHERE id = ?';
  db.query(query, [empID], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).send("Internal Server Error");
    }

    if (results.length === 0) {
      return res.render('index', { msg: "Employee not found" });
    }

    res.render('emp', { employee: results[0] });
  });

};

exports.backup = async (req, res) => {
  const option = req.body.backupOption;
  const tableName = "clients"; // You can make this dynamic if needed

  if (!option) {
    return res.status(400).send("Backup option is required.");
  }

  db.query(`SELECT * FROM ${tableName}`, async (err, results) => {
    if (err) {
      console.error("DB fetch error:", err);
      return res.status(500).send("Failed to fetch data");
    }

    if (option === "local") {
      try {
        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(results);

        const fileName = `${tableName}_backup_${Date.now()}.csv`;
        res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
        res.setHeader("Content-Type", "text/csv");
        res.send(csv);
      } catch (parseErr) {
        console.error("CSV conversion error:", parseErr);
        res.status(500).send("Failed to convert data to CSV");
      }
    }


    else if (option === "drive") {
      return res.status(501).send("Google Drive backup feature coming soon.");
    }

    else {
      res.status(400).send("Invalid backup option.");
    }
  });
};


// Format date to dd/mm/yyyy
function formatDate(date) {
  if(date==null)  
      return date
  return new Date(date).toLocaleDateString('en-GB'); // dd/mm/yyyy
};
// Formate date to yyyy/mm/dd
function formatYMD(date) {
  if(date==null)  
      return date
  const d = new Date(date);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  const year = d.getFullYear();
  return `${year}-${month}-${day}`;
};
// Format date + time to dd/mm/yyyy hh:mm AM/PM
function formatDateTime(date) {
  if(date==null)  
      return date
  
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }); // dd/mm/yyyy, hh:mm AM/PM
};







