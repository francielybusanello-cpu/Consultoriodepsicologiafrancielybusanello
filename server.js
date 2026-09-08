const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "troque-esta-chave",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

const PORT = process.env.PORT || 3000;
const PRICE_PER_HOUR = 30;
const ROOMS = ["Sala 1", "Sala 2", "Sala 3"];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservations (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      date DATE NOT NULL,
      room TEXT NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      amount INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_payment',
      transaction_nsu TEXT,
      capture_method TEXT,
      receipt_url TEXT,
      paid_amount INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function validTime(time) {
  return /^([01]\\d|2[0-3]):[0-5]\\d$/.test(time);
}

function hoursBetween(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);

  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

async function isAvailable(date, room, start, end) {
  const result = await pool.query(
    `
    SELECT id
    FROM reservations
    WHERE date = $1
      AND room = $2
      AND status IN ('confirmed', 'pending_payment')
      AND start_time < $4::time
      AND end_time > $3::time
    LIMIT 1
    `,
    [date, room, start, end]
  );

  return result.rows.length === 0;
}

function page(title, body) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
*{box-sizing:border-box}
body{
  margin:0;
  font-family:Arial,Helvetica,sans-serif;
  background:#f7f5f2;
  color:#333;
}
header{
  background:white;
  padding:24px 18px;
  text-align:center;
  border-bottom:1px solid #eee;
}
header h1{
  margin:0;
  font-size:25px;
  color:#574b45;
}
header p{
  margin:7px 0 0;
  color:#777;
}
.container{
  max-width:650px;
  margin:30px auto;
  padding:0 16px;
}
.card{
  background:white;
  border-radius:18px;
  padding:22px;
  margin-bottom:18px;
  box-shadow:0 3px 15px rgba(0,0,0,.06);
}
label{
  display:block;
  margin-top:14px;
  margin-bottom:6px;
  font-weight:bold;
}
input,select{
  width:100%;
  padding:13px;
  border:1px solid #ddd;
  border-radius:10px;
  font-size:16px;
  background:white;
}
button{
  width:100%;
  margin-top:20px;
  padding:15px;
  border:0;
  border-radius:11px;
  background:#66544b;
  color:white;
  font-size:17px;
  font-weight:bold;
}
button:disabled{
  opacity:.5;
}
.price{
  font-size:24px;
  font-weight:bold;
  color:#66544b;
  margin-top:18px;
}
.success{
  text-align:center;
  padding:25px 5px;
}
.slot{
  padding:12px;
  border:1px solid #ddd;
  border-radius:9px;
  margin-top:8px;
}
</style>
</head>
<body>
<header>
<h1>Consultório Franciely Busanello</h1>
<p>Sublo­cação de salas por hora</p>
</header>
<div class="container">
${body}
</div>
</body>
</html>
`;
}

app.get("/", async (req, res) => {
  res.send(
    page(
      "Consultório Franciely Busanello",
      `
<div class="card">
<h2>Agende sua sala</h2>
<p>Escolha a sala, data e horário.</p>

<form id="bookingForm">

<label>Nome</label>
<input id="name" required>

<label>Telefone</label>
<input id="phone" required>

<label>E-mail</label>
<input id="email" type="email">

<label>Data</label>
<input id="date" type="date" required>

<label>Sala</label>
<select id="room" required>
<option value="">Selecione</option>
${ROOMS.map(r => `<option>${r}</option>`).join("")}
</select>

<label>Horário de início</label>
<select id="start" required></select>

<label>Horário de término</label>
<select id="end" required></select>

<div class="price">
Valor: R$ <span id="amount">30,00</span>
</div>

<label>Forma de pagamento</label>
<select id="payment_method" required>
<option value="">Selecione</option>
<option value="cash">Dinheiro</option>
<option value="pix">Pix</option>
<option value="credit_card">Cartão de crédito</option>
</select>

<button type="submit">Agendar horário</button>
</form>

<div id="message"></div>
</div>

<script>
const start = document.getElementById("start");
const end = document.getElementById("end");
const amount = document.getElementById("amount");

for(let h=7; h<=21; h++){
  const time = String(h).padStart(2,"0")+":00";
  start.innerHTML += "<option value='"+time+"'>"+time+"</option>";
  end.innerHTML += "<option value='"+String(h+1).padStart(2,"0")+":00'>"+String(h+1).padStart(2,"0")+":00</option>";
}

function updateAmount(){
  const s=start.value;
  const e=end.value;

  if(!s || !e) return;

  const sh=parseInt(s.split(":")[0]);
  const eh=parseInt(e.split(":")[0]);

  const hours=eh-sh;

  if(hours>0){
    amount.textContent=(hours*30).toFixed(2).replace(".",",");
  }
}

start.addEventListener("change",updateAmount);
end.addEventListener("change",updateAmount);

document.getElementById("bookingForm").addEventListener("submit",async(e)=>{
  e.preventDefault();

  const data={
    name:document.getElementById("name").value,
    phone:document.getElementById("phone").value,
    email:document.getElementById("email").value,
    date:document.getElementById("date").value,
    room:document.getElementById("room").value,
    start_time:start.value,
    end_time:end.value,
    payment_method:document.getElementById("payment_method").value
  };

  const message=document.getElementById("message");
  message.innerHTML="<p>Verificando horário...</p>";

  try{
    const response=await fetch("/api/reservations",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(data)
    });

    const result=await response.json();

    if(!response.ok){
      message.innerHTML="<p>"+result.error+"</p>";
      return;
    }

    if(result.payment_url){
      window.location.href=result.payment_url;
      return;
    }

    message.innerHTML=
      "<div class='success'><h2>Agendamento realizado! ✅</h2>"+
      "<p>"+result.message+"</p></div>";

    document.getElementById("bookingForm").reset();

  }catch(error){
    message.innerHTML="<p>Não foi possível realizar o agendamento.</p>";
  }
});
</script>
`
    )
  );
});

app.post("/api/reservations", async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      date,
      room,
      start_time,
      end_time,
      payment_method
    } = req.body;

    if (!name || !phone || !date || !room || !start_time || !end_time) {
      return res.status(400).json({
        error: "Preencha todos os campos obrigatórios."
      });
    }

    if (!ROOMS.includes(room)) {
      return res.status(400).json({
        error: "Sala inválida."
      });
    }

    if (!validTime(start_time) || !validTime(end_time)) {
      return res.status(400).json({
        error: "Horário inválido."
      });
    }

    const hours = hoursBetween(start_time, end_time);

    if (hours <= 0 || !Number.isInteger(hours)) {
      return res.status(400).json({
        error: "O período deve ser de horas inteiras."
      });
    }

    if (start_time < "07:00" || end_time > "22:00") {
      return res.status(400).json({
        error: "O consultório funciona das 07:00 às 22:00."
      });
    }

    const available = await isAvailable(
      date,
      room,
      start_time,
      end_time
    );

    if (!available) {
      return res.status(409).json({
        error: "Esse horário já está reservado."
      });
    }

    const amount = Math.round(hours * PRICE_PER_HOUR * 100);

    let status =
      payment_method === "cash"
        ? "confirmed"
        : "pending_payment";

    const inserted = await pool.query(
      `
      INSERT INTO reservations
      (name, phone, email, date, room, start_time, end_time,
       amount, payment_method, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id
      `,
      [
        name,
        phone,
        email || null,
        date,
        room,
        start_time,
        end_time,
        amount,
        payment_method,
        status
      ]
    );

    const reservationId = inserted.rows[0].id;

    if (payment_method === "cash") {
      return res.json({
        success: true,
        message:
          "Seu horário foi reservado. O pagamento será realizado em dinheiro."
      });
    }

    if (!process.env.INFINITEPAY_HANDLE) {
      return res.status(500).json({
        error:
          "O pagamento online ainda não foi configurado no sistema."
      });
    }

    const baseUrl =
      process.env.BASE_URL ||
      `http://localhost:${PORT}`;

    const orderNsu = `reserva-${reservationId}`;

    const paymentResponse = await fetch(
      "https://api.checkout.infinitepay.io/links",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          handle: process.env.INFINITEPAY_HANDLE,
          order_nsu: orderNsu,
          redirect_url: `${baseUrl}/pagamento-concluido`,
          webhook_url: `${baseUrl}/webhook-infinitepay`,
          customer: {
            name,
            email: email || undefined,
            phone_number: phone
          },
          items: [
            {
              quantity: 1,
              price: amount,
              description: `${room} - ${date} ${start_time} às ${end_time}`
            }
          ]
        })
      }
    );

    const paymentData = await paymentResponse.json();

    if (!paymentResponse.ok || !paymentData.url) {
      await pool.query(
        `UPDATE reservations SET status='cancelled' WHERE id=$1`,
        [reservationId]
      );

      return res.status(500).json({
        error: "Não foi possível gerar o pagamento."
      });
    }

    return res.json({
      success: true,
      payment_url: paymentData.url
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Erro interno ao criar o agendamento."
    });
  }
});

app.post("/webhook-infinitepay", async (req, res) => {
  try {
    const data = req.body;

    const orderNsu = data.order_nsu;

    if (!orderNsu) {
      return res.status(400).json({
        success: false,
        message: "Pedido não encontrado"
      });
    }

    const reservationId = String(orderNsu).replace("reserva-", "");

    const result = await pool.query(
      `SELECT * FROM reservations WHERE id=$1`,
      [reservationId]
    );

    if (!result.rows.length) {
      return res.status(400).json({
        success: false,
        message: "Pedido não encontrado"
      });
    }

    const reservation = result.rows[0];

    if (
      Number(data.amount) !== Number(reservation.amount)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valor do pagamento não confere"
      });
    }

    await pool.query(
      `
      UPDATE reservations
      SET status='confirmed',
          transaction_nsu=$1,
          capture_method=$2,
          receipt_url=$3,
          paid_amount=$4
      WHERE id=$5
      `,
      [
        data.transaction_nsu || null,
        data.capture_method || null,
        data.receipt_url || null,
        data.paid_amount || data.amount,
        reservationId
      ]
    );

    return res.status(200).json({
      success: true,
      message: null
    });

  } catch (error) {
    console.error(error);

    return res.status(400).json({
      success: false,
      message: "Erro ao processar pagamento"
    });
  }
});

app.get("/pagamento-concluido", (req, res) => {
  res.send(
    page(
      "Pagamento concluído",
      `
      <div class="card success">
        <h2>Pagamento recebido! ✅</h2>
        <p>Seu pagamento foi encaminhado para confirmação.</p>
        <p>Seu horário será confirmado automaticamente.</p>
        <a href="/" style="display:block;margin-top:20px">
          Voltar para o início
        </a>
      </div>
      `
    )
  );
});

app.get("/api/reservations", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM reservations
      ORDER BY date, start_time
    `);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: "Não foi possível consultar as reservas."
    });
  }
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor funcionando na porta ${PORT}`);
    });
  })
  .catch(error => {
    console.error("Erro ao iniciar banco:", error);
    process.exit(1);
  });
