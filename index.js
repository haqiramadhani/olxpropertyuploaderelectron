require('dotenv').config()
const { app, BrowserWindow, Menu, shell } = require('electron')
const puppeteer = require("puppeteer-core")
const express = require('express')
const axios = require('axios')
const http = require('http')
const socket = require('socket.io')
const multer = require('multer')
const csvToJson = require('csvtojson')
const path = require('path')
const fs = require('fs')

let browser, page, window, popup, loggedIn = false
const {BROWSER_PORT, APP_PORT} = process.env

const expressApp = express()
const server = http.createServer(expressApp)
const io = socket(server)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'src', "files"))
    },
    filename: function (req, file, cb) {
        cb(
            null,
            file.fieldname + "-" + Date.now() + path.extname(file.originalname)
        )
    },
})
const upload = multer({storage})
const docs = require(path.join(__dirname, 'docs.json'))

expressApp.use(express.json())
expressApp.use(express.urlencoded())
expressApp.use(express.raw())

expressApp.engine('.html', require('ejs').__express)
expressApp.set('views', path.join(__dirname, 'src', 'views'))
expressApp.use(express.static(path.join(__dirname, 'src', 'public')))
expressApp.set('view engine', 'html')

app.commandLine.appendSwitch('remote-debugging-port', BROWSER_PORT || '8315')

const createWindow = async (endpoint, width, height) => {
    popup = new BrowserWindow({
        width: width || 360,
        height: height || 640,
        parent: window,
        modal: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
        }
    })

    await popup.loadURL('http://localhost:' + (APP_PORT || 8080) + endpoint)

    popup.on('close', () => popup = null)
    popup.setMenu(null);
}

const createMainWindow = async () => {
    window = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
        },
    })

    await window.loadURL('http://localhost:' + (APP_PORT || 8080) + '/docs')
    const {data: {webSocketDebuggerUrl}} = await axios.get(`http://localhost:${BROWSER_PORT || '8315'}/json/version`);
    browser = await puppeteer.connect({browserWSEndpoint: webSocketDebuggerUrl})
    page = (await browser.pages())[0]
}

app.whenReady().then(createMainWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow()
    }
})

const menu = Menu.buildFromTemplate([
    {
        label: 'Home',
        click: async () => {
            if (popup) {
                const page = (await browser.pages())[1]
                page.goto(`http://localhost:${APP_PORT || 8080}/`)
            }
            else await createWindow('/')
        }
    },
    {
        label: 'Login',
        click: async () => {
            if (popup) {
                const page = (await browser.pages())[1]
                page.goto(`http://localhost:${APP_PORT || 8080}/login`)
            }
            else await createWindow('/login')
        }
    },
    {
        label: 'Register',
        click: async () => {
            if (popup) {
                const page = (await browser.pages())[1]
                page.goto(`http://localhost:${APP_PORT || 8080}/register`)
            }
            else await createWindow('/register')
        }
    },
    {
        label: 'Docs',
        click: async () => {
            if (popup) {
                const page = (await browser.pages())[1]
                page.goto(`http://localhost:${APP_PORT || 8080}/docs`)
            }
            else await createWindow('/docs', 800, 600)
        }
    },
    {
        label: 'Help',
        click: async () => {
            const phone = '6288908883345';
            const text = 'Assalamualaikum saya mau tanya mengenai aplikasi electron puppeteer';
            await shell.openExternal(`https://web.whatsapp.com/send/?phone=${phone}&text=${text}`)
        }
    },
])

Menu.setApplicationMenu(menu)

server.listen(APP_PORT || '8080', () => console.log(`Server running in port ${APP_PORT || 8080}!
App URL => http://localhost:${APP_PORT || 8080}/`))

const getLogin = (req, res) => {
    // if already logged in redirect to home page
    if (loggedIn) return res.redirect('/');
    // read and filtering account files
    const files = fs.readdirSync(path.join(__dirname, 'src', 'accounts'));
    let accounts = [];
    files.forEach(file => {
        if (!file.endsWith('.data.json')) return;
        accounts.push(file.replace('.data.json', ''));
    });
    // return data list of account
    res.render('login', {title: 'Login', accounts});
}
const getRegister = (req, res) => {
    res.render('register', {title: 'Register'});
}
const getDocs = (req, res) => {
    res.render('docs', {title: 'Documentation', docs})
}
const getLogout = async (_req, res) => {
    await page.close();
    loggedIn = false;
    res.redirect('/');
}
const getHome = (req, res) => {
    // if not logged in redirect to login page
    if (!loggedIn) return res.redirect('/login');
    res.render('home', {title: 'Home'});
}
const loginHandler = async (req, res) => {
    const textData = fs.readFileSync(path.join(__dirname, 'src', 'accounts', req.body.account + '.data.json'), {'encoding': 'utf8', 'flag':'r'});
    let data;
    data = JSON.parse(textData);
    res.json({status: 'OK', code: 200, data: null});
    broadcast('Opening browser ..');
    const err = await login(page, data);
    setTimeout(() => {
        if (err) {
            page = false;
            return redirect('/');
        }
        broadcast('Login success ..')
        loggedIn = true
        redirect('/')
    }, 5000)
}
const registerHandler = (req, res) => {
    const {name, email, password} = req.body;
    if (!name) return res.render('register', {title: 'Register', message: 'Name is required!'});
    if (!email) return res.render('register', {title: 'Register', message: 'Email is required!'});
    if (!password) return res.render('register', {title: 'Register', message: 'Password is required!'});
    fs.writeFileSync(path.join(__dirname, 'src', `accounts/${name}.data.json`), JSON.stringify(req.body, null, 2));
    res.redirect('/login?account=' + req.body.name + '&action=login');
}
const removeHandler = (req, res) => {
    const {account: name} = req.body;
    fs.unlinkSync(path.join(__dirname, 'src', `accounts/${name}.data.json`));
    fs.rmdir(path.join(__dirname, 'src', 'sessions', name), { recursive: true }, (err) => {
        if (err) {
            throw err;
        }

        console.log(`${path.join(__dirname, 'src', 'sessions', name)} is deleted!`);
    });
    res.json({code: 200, status: 'OK', data: {message: 'account removed!'}})
}
const uploadHandler = upload.single('file')
const publishHandler = async (req, res) => {
    const file = req.file ? req.file.path : '';
    if (!file) {
        res.status(400).send({
            status: false,
            data: "No File is selected.",
        });
    }
    // return res.json({status: 'OK', code: 200, data: file});
    const lists = await csvToJson().fromFile(file);
    let i = 0
    for (const list of lists) {
        i += 1
        const {
            tipe,
            ac,
            swimmingPool,
            carport,
            garden,
            garage,
            telephone,
            pam,
            waterHeater,
            refrigerator,
            stove,
            microwave,
            oven,
            fireExtinguisher,
            gordyn,
            sertifikasi
        } = list;
        let fasilitas = [], images = [];
        if (ac === '1') fasilitas.push(1);
        if (swimmingPool === '1') fasilitas.push(2);
        if (carport === '1') fasilitas.push(3);
        if (garden === '1') fasilitas.push(4);
        if (garage === '1') fasilitas.push(5);
        if (telephone === '1') fasilitas.push(6);
        if (pam === '1') fasilitas.push(7);
        if (waterHeater === '1') fasilitas.push(8);
        if (refrigerator === '1') fasilitas.push(9);
        if (stove === '1') fasilitas.push(10);
        if (microwave === '1') fasilitas.push(11);
        if (oven === '1') fasilitas.push(12);
        if (fireExtinguisher === '1') fasilitas.push(13);
        if (gordyn === '1') fasilitas.push(14);
        const imageKeys = Object.keys(list).filter(item => item.startsWith('image'));
        imageKeys.forEach(image => {
            if (list[image]) images.push(list[image]);
        })
        const data = {
            ...list,
            tipe: Number(tipe),
            sertifikasi: Number(sertifikasi),
            fasilitas,
            images
        }
        console.log(data);
        const err = await sellHomeApartment(page, data);
        setTimeout(() => {
            if (err) {
                page = false;
                return redirect('/');
            }
            broadcast('Failed to upload data in the line' + i + '!');
            redirect('/');
        }, 5000)
    }
    broadcast('Upload success ..');
    return redirect('/');
}

// login page with list of account and add new account
expressApp.get('/login', getLogin)

// check and running bot if login
expressApp.post('/login', loginHandler);

// register page with text input and button
expressApp.get('/register', getRegister);

// create browser session
expressApp.post('/register', registerHandler);

// create browser session
expressApp.post('/remove', removeHandler);

// documentation
expressApp.get('/docs', getDocs);

// logout
expressApp.get('/logout', getLogout)

// home page with input file, log and button
expressApp.get('/', getHome);

// check & running bot if submit file
expressApp.post('/', uploadHandler, publishHandler);

const broadcast = (message) => {
    io.emit('message', message);
}

const redirect = (url) => {
    io.emit('redirect', url);
}

const login = async (page, data) => {
    const {email, password} = data;
    try {
        broadcast('Opening olx website ..');
        await page.goto('https://www.olx.co.id/post');
        try {
            broadcast('Click login with email ..');
            await page.click('[data-aut-id="emailLogin"]');
        } catch (e) {
            return broadcast('Already logged in ..')
        }
        try {
            broadcast('Fill login email ..');
            await page.type('#email_input_field', email + '\n');
        } catch (e) {
            broadcast('Failed fill login email ..');
            await page.close();
            return true;
        }
        try {
            broadcast('Fill login password ..');
            await page.waitForSelector('#password');
            await page.type('#password', password + '\n');
            broadcast('Checking valid login ..');
            await page.waitForSelector('ul[data-aut-id="categoryLevel"] > li:nth-child(2)');
        } catch (e) {
            broadcast('Failed to login please check your account detail ..');
            await page.close();
            return true;
        }
    } catch (e) {
        broadcast('Something wrong ..');
        await page.close();
        return true
    }
};

const sellHomeApartment = async (page, data) => {
    try {
        broadcast('Opening olx post page ..');
        await page.goto('https://www.olx.co.id/post');
    } catch (e) {
        page.close();
        broadcast('Failed to open olx post page!');
        return true;
    }
    try {
        broadcast('Chose a category, sub category and type ..');
        await page.waitForSelector('ul[data-aut-id="categoryLevel"] > li:nth-child(2)');
        await page.evaluate(`
    document.querySelector('ul[data-aut-id="categoryLevel"] > li:nth-child(2)').click();
    document.querySelector('ul[data-aut-id="subcategoryLevel"] > li:nth-child(1)').click();
  `);
    } catch (e) {
        page.close();
        broadcast('Failed to chose a category, sub-category and type!')
        return true;
    }
    try {
        broadcast('Chose type and certificate ..');
        await page.waitForSelector(`[data-aut-id="optype0"]`);
        await page.waitForSelector(`[data-aut-id="opp_certificate0"]`);
        await page.evaluate(`
    document.querySelector('[data-aut-id="optype${data.tipe - 1}"]').click();
    document.querySelector('[data-aut-id="opp_certificate${data.sertifikasi - 1}"]').click();
  `)
    } catch (e) {
        page.close();
        broadcast('Failed to chose type and certificate!')
        return true;
    }
    try {
        broadcast('Uploading images ..');
        const imageUploadElement = await page.$('input[type="file"]');
        for (const image of data.images) {
            await imageUploadElement.uploadFile(image);
        }
    } catch (e) {
        page.close();
        broadcast('Failed to uploading images!')
        return true;
    }
    try {
        broadcast('Fill building area ..');
        await page.type('#p_sqr_building', data.luasBangunan);
    } catch (e) {
        page.close();
        broadcast('Failed to Fill building area!');
        return true;
    }
    try {
        broadcast('Fill surface area ..');
        await page.type('#p_sqr_land', data.luasTanah);
    } catch (e) {
        page.close();
        broadcast('Failed to Fill surface area!');
        return true;
    }
    try {
        broadcast('Fill number of bedroom ..');
        await page.type('#p_bedroom', data.kamarTidur);
    } catch (e) {
        page.close();
        broadcast('Failed to Fill number of bedroom!');
        return true;
    }
    try {
        broadcast('Fill number of bathroom ..');
        await page.type('#p_bathroom', data.kamarMandi);
    } catch (e) {
        page.close();
        broadcast('Failed to Fill number of bathroom!');
        return true;
    }
    try {
        broadcast('Fill number of floor ..');
        await page.type('#p_floor', data.lantai);
    } catch (e) {
        page.close();
        broadcast('Failed to Fill number of floor!');
        return true;
    }
    try {
        broadcast('Fill address ..');
        await page.type('#p_alamat', data.alamatLokasi);
    } catch (e) {
        page.close();
        broadcast('Failed to Fill address!');
        return true;
    }
    try {
        broadcast('Fill ad title ..');
        await page.type('#title', data.judulIklan);
    } catch (e) {
        page.close();
        broadcast('Failed to Fill ad title!');
        return true;
    }
    try {
        broadcast('Fill description ..');
        await page.type('#description', data.deskripsi);
    } catch (e) {
        page.close();
        broadcast('Failed to Fill description!');
        return true;
    }
    try {
        broadcast('Fill price ..');
        await page.type('#price', data.harga);
    } catch (e) {
        page.close();
        broadcast('Failed to Fill price!');
        return true;
    }
    try {
        broadcast('Choose state ..');
        await page.type('#State', data.wilayah);
    } catch (e) {
        page.close();
        broadcast('Failed to Choose state!');
        return true;
    }
    try {
        broadcast('Choose city ..');
        await page.waitForSelector('#City');
        await page.type('#City', data.kota);
    } catch (e) {
        page.close();
        broadcast('Failed to Choose city!');
        return true;
    }
    try {
        broadcast('Choose locality ..');
        await page.waitForSelector('#Locality');
        await page.type('#Locality', data.kecamatan);
    } catch (e) {
        page.close();
        broadcast('Failed to Choose locality!');
        return true;
    }
    try {
        broadcast('Fill facilities check ..');
        if (data.fasilitas.includes(1)) await page.click('#checkbox-ac');
        if (data.fasilitas.includes(2)) await page.click('#checkbox-swimmingpool');
        if (data.fasilitas.includes(3)) await page.click('#checkbox-carport');
        if (data.fasilitas.includes(4)) await page.click('#checkbox-garden');
        if (data.fasilitas.includes(5)) await page.click('#checkbox-garasi');
        if (data.fasilitas.includes(6)) await page.click('#checkbox-telephone');
        if (data.fasilitas.includes(7)) await page.click('#checkbox-pam');
        if (data.fasilitas.includes(8)) await page.click('#checkbox-waterheater');
        if (data.fasilitas.includes(9)) await page.click('#checkbox-refrigerator');
        if (data.fasilitas.includes(10)) await page.click('#checkbox-stove');
        if (data.fasilitas.includes(11)) await page.click('#checkbox-microwave');
        if (data.fasilitas.includes(12)) await page.click('#checkbox-oven');
        if (data.fasilitas.includes(13)) await page.click('#checkbox-fireextenguisher');
        if (data.fasilitas.includes(14)) await page.click('#checkbox-gordyn');
    } catch (e) {
        page.close();
        broadcast('Failed to Fill facilities check!');
        return true;
    }
    try {
        broadcast('Publish ad ..')
        await page.click('[data-aut-id="btnPost"]');
    } catch (e) {
        page.close();
        broadcast('Failed to Publish ad!');
        return true;
    }
    try {
        broadcast('Delay after post ' + (data.delay ? data.delay / 1000 : 60) + ' seconds ..');
        await page.waitForTimeout(data.delay || 60000);
    } catch (e) {
        page.close();
        broadcast('Failed to delay after post!');
        return true;
    }
}