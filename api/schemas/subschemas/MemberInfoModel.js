const MemberInfoSchema = new Schema({
    MemberState:Number,
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
    }

});

const MemberInfo = mongoose.model('MemberInfo', MemberInfoSchema);
export default MemberInfo;