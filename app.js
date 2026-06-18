import { MongoClient } from 'mongodb';
import express from "express";
import morgan from "morgan";
// import cors from "cors";

const app = express();

app.use(morgan("dev"));

// // Allows requests from all hostname
// app.use(
//   cors({
//     origin: "https://crud-demo-frontend.vercel.app",
//     credentials: true,
//   })
// );


const uri = 'mongodb+srv://phcf-database-user:phcfDatabaseUser01@phcf-db.wkn2lfe.mongodb.net/?appName=PHCF-DB';
const client = new MongoClient(uri);


const runApp = async () => {
  try {
    await client.connect();
  } catch (e) {
    console.error(e)
  }finally {
    await client.close();
  }
};

runApp().catch(console.error);



//Get the bakend online


//Work on creating different API Endpoints
//    - Work on general member API calls 

//Different API calls

//CREATE
// ✅ Can add a new member to the database
// ✅ Can add entries for new members, box, and work formula
// ✅ Should be able to update their hours (work/open) and status

//READ 
// ✅ Find one member by name and email (one document)
// ✅ Find multiple members by type, member state, box state, due state, role, requirements, and/or orientation date
// ✅ Find one box by it's number
// ✅ find one box by members associated by it
// ✅ Find one WorkFormula by name
// ✅ Find multiple WorkFormula by service type and hours required

//UPDATE
// ✅ Can update member, box, and work formula'
// ✅ Should be able to update members hours (work/open) and status
//      - Box
// ✅ Member entry is never deletde just listed as inactive





