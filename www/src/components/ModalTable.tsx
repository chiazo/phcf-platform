import Checkbox from '@mui/material/Checkbox';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import { acceptRequest, deleteRequest } from '../lib/pocketbase';

export default function ModalTable( { members }: { members: Array<Record<string, any>> } ){

    function closeModal(){
        const modal = document.getElementById("myModal");
        if(modal){
            modal.style.display = "none";
        }
    }

    return(
    <div id="myModal" className="modal">
      <div className="modal-content">
        <span className="close" onClick={closeModal}>&times;</span>
        <div className="modal-table-wrapper">
        <table>
        <thead>
            <tr>
                <th colSpan={6}>Personal Info</th>
                <th colSpan={9}>Member Status</th>
             </tr>
          </thead>
          <thead>
                    <tr>
                    <th></th>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Address</th>
                    <th>Member Role</th>
                    <th>Member Type</th>
                    <th>Member Status</th>
                    <th>Payment Status</th>
                    <th>Amount Paid</th>
                    <th>Payment Type</th>
                    <th>Meetings Completed</th>
                    <th>Service Hours Required</th>
                    <th></th>
                    <th></th>
                    </tr>
                </thead>
          <tbody>
           {members.map((singleMember) => (
            <tr>
                <td>
                    <Checkbox
                    color="primary"
                    />
                </td>
                <td>{singleMember.personal_info.firstName + " " + singleMember.personal_info.lastName}</td>
                <td>{singleMember.personal_info.emailInfo.primaryEmail}</td>
                <td>{singleMember.personal_info.address.line1 + 
                    ", " + singleMember.personal_info.address.city + 
                    ", " + singleMember.personal_info.address.zipCode}</td>
                <td>{singleMember.member_info.role}</td>
                <td>{singleMember.member_info.memberType}</td>
                <td>{singleMember.member_info.memberState}</td>
                <td>{singleMember.member_info.dues.dueState}</td>
                <td>{singleMember.member_info.dues.paymentType}</td>
                <td>{singleMember.member_info.dues.paymentType}</td>
                <td>{singleMember.member_info.requirements.meetingsCompleted}</td>
                <td></td>
                <td><CheckIcon onClick={() => {acceptRequest(singleMember)}}/></td>
                <td><DeleteIcon onClick={() => {deleteRequest(singleMember)}}/></td>
            </tr>
           ))}
            
          </tbody>
        </table>
        </div>
      </div>

    </div>
    );
}