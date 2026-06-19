const express = require("express");
const mongoose = require("mongoose");
const {MemberSnapshotSchema} = require("./userSchemaModel.js");
console.log(MemberSnapshotSchema);
const app = express();


app.use(express.static("./"));
app.use(express.json());
app.use(express.urlencoded({extended: false}));



//  call to mongo cluster
app.get("/data", (req,res) => {
    console.log("IN HERE");
    MemberSnapshotSchema.findOne({_id: "6a35a88e0dd9ad510cc3151d"},(err, results, count)=>{
        console.log(results);
        res.status(200).json(results);
    });
});