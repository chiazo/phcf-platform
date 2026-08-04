import { useEffect, useState } from "react";
import Checkbox from '@mui/material/Checkbox';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import { acceptRequest, deleteRequest } from '../lib/pocketbase';

export default function ModalTable( { members, onActionComplete }: { members: Array<Record<string, any>>, onActionComplete?: () => void } ){

    function closeModal(){
        const modal = document.getElementById("myModal");
        if(modal){
            modal.style.display = "none";
        }
        onActionComplete?.();
    }

    async function handleAccept(singleMember: Record<string, any>){
        await acceptRequest(singleMember);
        onActionComplete?.();
    }

    async function handleDelete(singleMember: Record<string, any>){
        await deleteRequest(singleMember);
        onActionComplete?.();
    }

    return(
    <div id="myModal" className="modal">
      <div className="modal-content">
        <span className="close" onClick={closeModal}>&times;</span>
        <div className="modal-table-wrapper">
        <table>
        <thead>
            <tr>
                <th colSpan={3}>Personal Info</th>
                <th colSpan={7}>Member Info</th>
             </tr>
          </thead>
          <thead>
                    <tr>
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
                    <th></th>
                    <th></th>
                    </tr>
                </thead>
          <tbody>
           {members.map((singleMember) => (
            <tr>
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
                <td><CheckIcon style={{ color: "green" }} onClick={() => {handleAccept(singleMember)}}/></td>
                <td><DeleteIcon style={{ color: "red" }} onClick={() => {handleDelete(singleMember)}}/></td>
            </tr>
           ))}
            
          </tbody>
        </table>
        </div>
      </div>

    </div>
    );
}
