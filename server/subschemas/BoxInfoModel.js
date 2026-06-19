const BoxInfoSchema = new Schema({
    box_state: Number,
    box_id:Number,
    change_requester:String,
    WaitlistInfo:{
        joined_waitlist_at:Number,
        waitlist_number:Number,
    }
})

// EXPORTS
const BoxInfo = mongoose.model('BoxInfo', BoxInfoSchema);

export default BoxInfo;
