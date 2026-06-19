import mongoose from 'mongoose';
const { Schema } = mongoose;

// the following imports are for if we switch from referential to embedded models
// import TIMEATTR from './timeAttributeModel';
// import PersonalInfo from './PersonalInfoModel';
// import MemberInfo from './MemberInfoModel';
// import BoxInfo from './subschemas/BoxInfoModel';

const MemberSnapshotSchema = new Schema({
    id:Number,
    // member_id:Number,
    updated_by:String,
    notes:String,
    box_info:{
        box_state: Number,
        box_id:Number,
        change_requester:String,
        WaitlistInfo:{
            joined_waitlist_at:Number,
            waitlist_number:Number,
        }
    },
    personal_info:{
        firstname:String,
        lastname:String,
        pronouns:String,
        Address: {
            line_1: String,
            line_2: String,
            city:String,
            zip_code:String,
        },
        EmailInfo: {
            primary_email: String,
            secondary_email: String,
            on_mailing_list: Boolean,
        },
        PhoneInfo:{
            primary_phone_number:String,
            secondary_phone_number:String,
        },
    },
    member_info:{
        MemberState: Number,
        Role: Number,
        MemberType: String,
        OrientationDate:Number,
        Dues:{
            due_state:Number,
            dues_paid_at:Number,
            amount_paid:Number,
            payment_type:String,
        },
        Requirements:{
            meetings_required:Number,
            meetings_completed:Number,
            ServiceRequirement:{
                work_formula_id:String,
                hours_completed:Number,
            }
    },
    time_attr:{
        created_at: Number,
        modified_at: Number,
    }}
})




// export modules
// version 1
module.exports.MemberSnapshotSchema = mongoose.model("MemberSnapshotSchema",MemberSnapshotSchema)

// version 2
// const MemberSnapshot = mongoose.model('MemberSnapshot', MemberSnapshotSchema);
// export default MemberSnapshot;


// connect to Mongo
mongoose.connect("mongodb+srv://igracedaniel_db_user:SxbUXel4tOO83dyF@gardenuserdata.tqxcqrn.mongodb.net/", (err) => {
    if (err){
        console.log(err);
    }
    console.log("connected");
});