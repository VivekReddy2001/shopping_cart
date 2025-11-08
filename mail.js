var nodemailer = require('nodemailer');

var transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
  auth: {
    user: 'jayaramnaik725@gmail.com',
    pass: 'ojcowsmtwgzqvyxv'
  }
});


module.exports = (destination , subject , text) =>{

  var mailOptions = {
    from: 'jayaramnaik725@gmailcom',
    to: destination,
    subject: subject,
    text: text
  };
  transporter.sendMail(mailOptions, function(error, info){
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
}