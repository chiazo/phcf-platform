const TimeAttributeSchema = new Schema({
    created_at: Number,
    modified_at: Number,
})

const TIMEATTR = mongoose.model('TIMEATTR', TimeAttributeSchema);

export default TIMEATTR;