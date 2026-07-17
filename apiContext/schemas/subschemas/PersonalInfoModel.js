const PersonalInfoSchema = new Schema({
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

const personal_info = mongoose.model('PersonalInfo', PersonalInfoSchema);
export default personal_info;
