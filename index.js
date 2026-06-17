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

//General Members
// - Can add a new member to the database
// - Should be able to update their hours (work/open) and status

//Admin Members
// - Can add entries for new members, box, and work formula
// - Can update member, box, and work formula'
//      - Box
// - Member entry is never deletde just listed as inactive


