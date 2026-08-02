import Checkbox from '@mui/material/Checkbox';

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
                <th colSpan={9}>Personal Info</th>
                <th colSpan={9}>Member Status</th>
             </tr>
          </thead>
          <thead>
                    <tr>
                    <th>Full Name</th>
                    <th>Amount Paid</th>
                    <th>Member Role</th>
                    <th>Member Type</th>
                    <th>Member Status</th>
                    <th>Email</th>
                    <th>Street</th>
                    <th>Status</th>
                    <th>Zip Code</th>
                    <th>Payment Status</th>
                    <th>Amount Paid</th>
                    <th>Payment Type</th>
                    <th>Meetings Completed</th>
                    <th>Servince Hours Required</th>
                    </tr>
                </thead>
          <tbody>
            
          </tbody>
        </table>
        </div>
      </div>

    </div>
    );
}