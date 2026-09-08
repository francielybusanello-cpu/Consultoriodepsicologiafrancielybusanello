const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PRICE_PER_HOUR = 30;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INFINITEPAY_HANDLE = process.env.INFINITEPAY_HANDLE;

async function supabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || "Erro no banco de dados");
  }

  return text ? JSON.parse(text) : null;
}

function hoursBetween(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
}

function validTime(time) {
  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Consultório Franciely Busanello</title>
<style>
*{box-sizing:border-box}
body{
  margin:0;
  font-family:Arial,sans-serif;
  background:#f7f4f1;
  color:#333;
}
header{
  background:white;
  padding:28px 20px;
  text-align:center;
  box-shadow:0 2px 10px #0001;
}
h1{margin:0;color:#5d4a42;font-size:27px}
.subtitle{margin-top:8px;color:#777}
.container{
  max-width:650px;
  margin:35px auto;
  padding:0 18px;
}
.card{
  background:white;
  border-radius:18px;
  padding:25px;
  box-shadow:0 4px 20px #0001;
}
h2{color:#5d4a42}
label{
  display:block;
  margin-top:17px;
  font-weight:bold;
}
input,select{
  width:100%;
  padding:13px;
  margin-top:7px;
  border:1px solid #ddd;
  border-radius:10px;
  font-size:16px;
}
button{
  width:100%;
  margin-top:25px;
  padding:15px;
  border:0;
  border-radius:10px;
  background:#80695d;
  color:white;
  font-size:17px;
  font-weight:bold;
}
.price{
  margin-top:20px;
  padding:15px;
  background:#f4eee9;
  border-radius:10px;
  text-align:center;
  font-size:18px;
}
.info{
  margin-top:20px;
  color:#777;
  font-size:14px;
  line-height:1.5;
}
.success{
  text-align:center;
  padding:30px 10px;
}
</style>
</head>

<body>
<header>
<h1>Consultório FRANCIELY BUSANELLO</h1>
<div class="subtitle">Agendamento de salas</div>
</header>

<div class="container">
<div class="card">

<h2>Reserve sua sala</h2>

<form id="form">

<label>Nome</label>
<input id="name" required>

<label>Telefone</label>
<input id="phone" required>

<label>E-mail</label>
<input id="email" type="email">

<label>Data</label>
<input id="date" type="date" required>

<label>Sala</label>
<select id="room">
<option value="Sala 1">Sala 1</option>
<option value="Sala 2">Sala 2</option>
<option value="Sala 3">Sala 3</option>
</select>

<label>Horário de início</label>
<input id="start" type="time" min="07:00" max="21:00" required>

<label>Horário de término</label>
<input id="end" type="time" min="08:00" max="22:00" required>

<label>Forma de pagamento</label>
<select id="payment">
<option value="pix">Pix</option>
<option value="credit_card">Cartão de crédito</option>
<option value="cash">Dinheiro</option>
</select>

<div class="price" id="price">
Valor: R$ 30,00
</div>

<button type="submit">Continuar</button>

<div class="info">
Atendimento das 07h às 22h.<br>
Valor da sala: R$ 30,00 por hora.<br>
Para Pix e cartão, a reserva será confirmada após a aprovação do pagamento.
</div>

</form>
</div>
</div>

<script>
const start = document.getElementById("start");
const end = document.getElementById("end");
const price = document.getElementById("price");

function updatePrice(){
  if(!start.value || !end.value) return;

  const [sh,sm] = start.value.split(":").map(Number);
  const [eh,em] = end.value.split(":").map(Number);

  const hours = ((eh*60+em)-(sh*60+sm))/60;

  if(hours > 0){
    price.textContent =
      "Valor: R$ " + (hours*30).toFixed(2).replace(".",",");
  }
}

start.addEventListener("change",updatePrice);
end.addEventListener("change",updatePrice);

document.getElementById("form").addEventListener("submit", async e=>{
  e.preventDefault();

  const data = {
    name: document.getElementById("name").value,
    phone: document.getElementById("phone").value,
    email: document.getElementById("email").value,
    date: document.getElementById("date").value,
    room: document.getElementById("room").value,
    start: start.value,
    end: end.value,
    payment_method: document.getElementById("payment").value
  };

  const button = e.target.querySelector("button");
  button.disabled = true;
  button.textContent = "Verificando disponibilidade...";

  try{
    const response = await fetch("/api/booking",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(data)
    });

    const result = await response.json();

    if(!response.ok){
      throw new Error(result.error || "Não foi possível realizar a reserva.");
    }

    if(result.payment_url){
      window.location.href = result.payment_url;
      return;
    }

    document.querySelector(".card").innerHTML = `
      <div class="success">
        <h2>Reserva realizada! ✅</h2>
        <p>${result.message}</p>
        <p><strong>Sala:</strong> ${data.room}</p>
        <p><strong>Data:</strong> ${data.date}</p>
        <p><strong>Horário:</strong> ${data.start} às ${data.end}</p>
      </div>
    `;

  }catch(error){
    alert(error.message);
    button.disabled = false;
    button.textContent = "Continuar";
  }
});
</script>

</body>
</html>
  `);
});

app.post("/api/booking", async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      date,
      room,
      start,
      end,
      payment_method
    } = req.body;

    if (!name || !phone || !date || !room || !start || !end || !payment_method) {
      return res.status(400).json({error:"Preencha todos os campos obrigatórios."});
    }

    if (!validTime(start) || !validTime(end)) {
      return res.status(400).json({error:"Horário inválido."});
    }

    const hours = hoursBetween(start, end);

    if (hours <= 0 || hours > 15) {
      return res.status(400).json({error:"O horário informado é inválido."});
    }

    if (start < "07:00" || end > "22:00") {
      return res.status(400).json({error:"O consultório funciona das 07h às 22h."});
    }

    const conflicts = await supabase(
      `reservations?select=id&date=eq.${date}&room=eq.${encodeURIComponent(room)}&start_time=lt.${end}&end_time=gt.${start}&status=in.(confirmed,pending_payment)`
    );

    if (conflicts && conflicts.length > 0) {
      return res.status(409).json({
        error:"Esse horário já está reservado para esta sala."
      });
    }

    const amount = Math.round(hours * PRICE_PER_HOUR * 100);

    const reservation = await supabase("reservations", {
      method:"POST",
      headers:{
        "Prefer":"return=representation"
      },
      body:JSON.stringify({
        name,
        phone,
        email,
        date,
        room,
        start_time:start,
        end_time:end,
        amount,
        payment_method,
        status: payment_method === "cash"
          ? "confirmed"
          : "pending_payment"
      })
    });

    const booking = reservation[0];

    if (payment_method === "cash") {
      return res.json({
        message:"Sua reserva foi registrada. O pagamento será realizado em dinheiro."
      });
    }

    if (!INFINITEPAY_HANDLE) {
      return res.status(500).json({
        error:"InfinitePay ainda não foi configurada."
      });
    }

    const baseUrl =
      process.env.PUBLIC_URL ||
      `${req.protocol}://${req.get("host")}`;

    const orderNsu = String(booking.id);

    const checkout = await fetch(
      "https://api.checkout.infinitepay.io/links",
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          handle:INFINITEPAY_HANDLE,
          order_nsu:orderNsu,
          redirect_url:`${baseUrl}/pagamento-concluido`,
          webhook_url:`${baseUrl}/webhook-infinitepay`,
          customer:{
            name,
            email,
            phone_number:phone
          },
          items:[
            {
              quantity:1,
              price:amount,
              description:`Reserva ${room} - ${date} ${start} às ${end}`
            }
          ]
        })
      }
    );

    const checkoutData = await checkout.json();

    if (!checkout.ok || !checkoutData.url) {
      console.error(checkoutData);

      return res.status(500).json({
        error:"Não foi possível criar o pagamento."
      });
    }

    res.json({
      payment_url:checkoutData.url
    });

  } catch(error) {
    console.error(error);
    res.status(500).json({
      error:"Erro interno do sistema."
    });
  }
});

app.post("/webhook-infinitepay", async (req,res)=>{
  try {
    const {
      order_nsu,
      amount,
      paid_amount,
      transaction_nsu,
      capture_method,
      receipt_url
    } = req.body;

    if (!order_nsu) {
      return res.status(400).json({
        success:false,
        message:"Pedido não encontrado"
      });
    }

    const reservations = await supabase(
      `reservations?id=eq.${encodeURIComponent(order_nsu)}&select=*`
    );

    if (!reservations || reservations.length === 0) {
      return res.status(400).json({
        success:false,
        message:"Reserva não encontrada"
      });
    }

    const reservation = reservations[0];

    if (Number(amount) !== Number(reservation.amount)) {
      return res.status(400).json({
        success:false,
        message:"Valor diferente do esperado"
      });
    }

    await supabase(`reservations?id=eq.${encodeURIComponent(order_nsu)}`,{
      method:"PATCH",
      body:JSON.stringify({
        status:"confirmed",
        transaction_nsu,
        capture_method,
        receipt_url,
        paid_amount
      })
    });

    res.status(200).json({
      success:true,
      message:null
    });

  } catch(error) {
    console.error(error);

    res.status(400).json({
      success:false,
      message:"Erro ao confirmar pagamento"
    });
  }
});

app.get("/pagamento-concluido",(req,res)=>{
  res.send(`
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Pagamento concluído</title>
  <style>
  body{
    font-family:Arial;
    background:#f7f4f1;
    text-align:center;
    padding:60px 20px;
  }
  .box{
    max-width:500px;
    margin:auto;
    background:white;
    padding:35px;
    border-radius:20px;
  }
  </style>
  </head>
  <body>
  <div class="box">
  <h1>Pagamento recebido! ✅</h1>
  <p>Seu pagamento foi encaminhado para confirmação.</p>
  <p>Sua reserva será liberada após a confirmação do pagamento.</p>
  </div>
  </body>
  </html>
  `);
});

app.listen(PORT,()=>{
  console.log(`Consultório rodando na porta ${PORT}`);
});
