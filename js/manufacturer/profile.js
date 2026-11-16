window.onload = function(){

    loadProfile();

};

// ========================
// LOAD PROFILE
// ========================

function loadProfile(){

    const profile =
    JSON.parse(
        localStorage.getItem(
            "manufacturerProfile"
        )
    );

    if(!profile){
        return;
    }

    document.getElementById(
        "companyName"
    ).value =
    profile.companyName || "";

    document.getElementById(
        "contactPerson"
    ).value =
    profile.contactPerson || "";

    document.getElementById(
        "email"
    ).value =
    profile.email || "";

    document.getElementById(
        "mobile"
    ).value =
    profile.mobile || "";

    document.getElementById(
        "gstNumber"
    ).value =
    profile.gstNumber || "";

    document.getElementById(
        "licenseNumber"
    ).value =
    profile.licenseNumber || "";

    document.getElementById(
        "address"
    ).value =
    profile.address || "";

}

// ========================
// SAVE PROFILE
// ========================

function saveProfile(){

    const profile = {

        companyName:
        document.getElementById(
            "companyName"
        ).value,

        contactPerson:
        document.getElementById(
            "contactPerson"
        ).value,

        email:
        document.getElementById(
            "email"
        ).value,

        mobile:
        document.getElementById(
            "mobile"
        ).value,

        gstNumber:
        document.getElementById(
            "gstNumber"
        ).value,

        licenseNumber:
        document.getElementById(
            "licenseNumber"
        ).value,

        address:
        document.getElementById(
            "address"
        ).value

    };

    localStorage.setItem(

        "manufacturerProfile",

        JSON.stringify(profile)

    );

    alert(
        "Profile Updated Successfully"
    );

}