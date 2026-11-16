window.onload = function(){

    loadProfile();

};

// =======================
// LOAD PROFILE
// =======================

function loadProfile(){

    const profile =
    JSON.parse(
        localStorage.getItem(
            "powerPlantProfile"
        )
    );

    if(!profile){

        return;

    }

    document.getElementById(
        "plantName"
    ).value =
    profile.plantName || "";

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
        "capacity"
    ).value =
    profile.capacity || "";

    document.getElementById(
        "gstNumber"
    ).value =
    profile.gstNumber || "";

    document.getElementById(
        "address"
    ).value =
    profile.address || "";

}

// =======================
// SAVE PROFILE
// =======================

function saveProfile(){

    const profile = {

        plantName:
        document.getElementById(
            "plantName"
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

        capacity:
        document.getElementById(
            "capacity"
        ).value,

        gstNumber:
        document.getElementById(
            "gstNumber"
        ).value,

        address:
        document.getElementById(
            "address"
        ).value

    };

    localStorage.setItem(

        "powerPlantProfile",

        JSON.stringify(profile)

    );

    alert(
        "Profile Updated Successfully"
    );

}