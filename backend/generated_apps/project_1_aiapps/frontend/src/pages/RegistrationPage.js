// Page ID: page-default-1767732555488
// Page Name: Registration
import React from 'react';
import '../styles/RegistrationPage.css';

function RegistrationPage() {
  return (
    <div className="registrationpage">
      <main className="component-comp-1767741075925-13-h3pocyh">
        <form className="component-comp-1767741075925-5-7pri0c">
          <h2 className="component-comp-1767741075925-6-qf45hq">
Create Account
          </h2>
          <input className="component-comp-1767741075925-7-au5yjd" type="text" placeholder="First Name" name="first_name" />
          <input className="component-comp-1767741075925-8-e5c4ue" type="text" placeholder="Last Name" name="last_name" />
          <input className="component-comp-1767741075925-9-0wywak" type="text" placeholder="DOB" name="d_o_b" />
          <input className="component-comp-1767741075925-10-d1i898" type="email" placeholder="Email" name="user_email" />
          <input className="component-comp-1767741075925-11-i2f3h" type="password" placeholder="Password" name="user_password" />
          <button className="component-comp-1767741075925-12-to0yu8">
Sign Up
          </button>
        </form>
      </main>
    </div>
  );
}

export default RegistrationPage;