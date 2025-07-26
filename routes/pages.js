// module.exports = router;
const express = require("express");
const router = express.Router();
const backend = require("../Backend/logic");

router.get('/index', (req, res) => {
  res.render("index");
});

// ✅ PROTECTED ROUTES — Admin or Employee
router.get('/home', (req, res) => {
  if (req.session && req.session.userType) {
    res.render("home");
  } else {
    res.redirect('/index');
  }
});
// Home as /
router.get('/', (req, res) => {
  if (req.session && req.session.userType) {
    res.render("home");
  } else {
    res.redirect('/index');
  }
});

router.get('/print', (req, res) => {
  if (req.session && req.session.userType) {
    res.render("print");
  } else {
    res.redirect('/index');
  }
});

router.get("/table", (req, res) => {
  if (req.session && req.session.userType) {
    backend.table(req, res);
  } else {
    res.redirect('/index');
  }
});

router.get('/notification', (req, res) => {
  if (req.session && req.session.userType) {
    backend.loadNotifications(req, res);
  } else {
    res.redirect('/index');
  }
});

router.get('/send-whatsapp', (req, res) => {
  if (req.session && req.session.userType) {
    backend.sendWhatsAppNotification(req, res);
  } else {
    res.redirect('/index');
  }
});

router.get('/emp', (req,res) => {
  backend.emp(req,res);
})

// ✅ ADMIN-ONLY ROUTE
router.get('/admin', (req, res) => {
  if (req.session && req.session.userType === 'admin') {
    backend.admin(req, res);
  }
  else if (req.session && req.session.userType === 'employee'){
    res.redirect('/emp'); 
  }
  else {
    res.redirect('/index'); // or res.status(403).send('Forbidden');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.log("Logout Error:", err);
    res.redirect('/index');
  });
});


module.exports = router;
