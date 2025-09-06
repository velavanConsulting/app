const express =  require("express");

const backend = require("../Backend/logic");

const router = express.Router();

router.post("/login",backend.login);

router.post("/search",backend.search);

router.post("/generate-report",backend.gr);

router.post("/add",backend.addClient);

router.post("/Nedit",backend.NeditClient);

router.post("/edit",backend.editClient);

router.post("/delete",backend.deleteClient);

router.post("/backup",backend.backup);

//small function

router.post("/add_employee",backend.AddEmployee);

router.post("/delete_employee",backend.DeleteEmployee);

router.post("/change_password",backend.ChangePassword);

router.post("/change_email",backend.ChangeEmail);

module.exports = router;



