const PersonalInfoSchema = new Schema({
    PersonalInfo:{
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
    }

});

// NOTES:
// prev attributes of PersonalInfoSchema:
    // id: Number, 
    // member_snapshot_id:Number,
    // MemberType:String,
    // DueState:Number,
    // Role:Number,
    // ServiceType:Number,

const PersonalInfo = mongoose.model('PersonalInfo', PersonalInfoSchema);
export default PersonalInfo;
