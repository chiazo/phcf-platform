import mongoose from 'mongoose';
const { Schema } = mongoose;

import MONGOUSERNAME from '.env';
import MONGOPASSWORD from '.env';

// the following imports are for if we switch from referential to embedded models
// import time_attr from './timeAttributeModel';
// import personal_info from './PersonalInfoModel';
// import member_info from './MemberInfoModel';
// import box_info from './subschemas/BoxInfoModel';




const MemberSnapshotSchema = new Schema({
    _id: String,
    updated_by: String,
    notes: String,
    personal_info:{
        first_name: String,
        last_name: String,
        pronouns: String,
        address: {
            line_1: String,
            line_2: String,
            city: String,
            zip_code: String,
        },
        email_info: {
            primary_email: String,
            secondary_email: String,
            on_mailing_list: Boolean,
        },
        phone_info:{
            primary_phone_number: String,
            secondary_phone_number: String,
        },
    },
    member_info:{
        member_state: Number,
        role: Number,
        member_type: String,
        orientation_date: String,
        dues:{
            due_state: Number,
            dues_paid_at: String,
            amount_paid: Number,
            payment_type: String,
        },
        requirements:{
            meetings_required: Number,
            meetings_completed: Number,
            service_requirement:{
                work_formula_id: String,
                hours_completed: Number,
            }
    },
    box_ID: String,
    waitlist_info:{
        joined_waitlist_at: String,
        waitlist_number: Number
    },
    time_attr:{
        created_at: String,
        modified_at: String,
    }}
})

const BoxSchema = new Schema({
    box_id: String,
    box_state: Number,
    updated_by: String,
})

const WorkFormula = new Schema({
    _id: String,
    service_type: Number,
    name: Number,
    hours_required: Number
})


const GardenData = new Schema({
    users:[MemberSnapshotSchema],
    boxes:[BoxSchema],
    work_formulas:[WorkFormula]
})

// export modules
// version 1
module.exports.MemberSnapshotSchema = mongoose.model("MemberSnapshotSchema",MemberSnapshotSchema)

// version 2
// const MemberSnapshot = mongoose.model('MemberSnapshot', MemberSnapshotSchema);
// export default MemberSnapshot;


// connect to Mongo
mongoose.connect(`mongodb+srv://${MONGOUSERNAME}:${MONGOPASSWORD}@gardenuserdata.tqxcqrn.mongodb.net/`, (err) => {
    if (err){
        console.log(err);
    }
    console.log("connected");
});