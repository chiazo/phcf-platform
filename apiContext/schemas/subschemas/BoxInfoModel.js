const BoxInfoSchema = new Schema({
    box_info:{
        box_state: Number,
        box_id: Number,
        change_requester: String,
        waitlist_info:{
            joined_waitlist_at: Number,
            waitlist_number: Number,
        }
    }
})

// EXPORTS
const box_info = mongoose.model('BoxInfo', BoxInfoSchema);

export default box_info;
