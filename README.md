<!-- markdownlint-disable-next-line -->
<img width="150" src="/public/assets/logo.png" alt="Beyond Ys logo">

# Beyond Ys Editor

Content editor for [Beyond Ys](https://beyond-ys.vercel.app).

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/en/download/)
- [Firebase project](https://firebase.google.com/docs/web/setup) or [Local Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure)

### Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/franz-dc/beyond-ys.git
   ```

2. Install dependencies:

   ```sh
   npm i
   # or
   yarn
   ```

3. Create `.env.local` by copying `.env` and replace the values with your own:

   ```sh
   cp .env .env.local
   ```

4. Set up your **Firebase project** or **Firebase Local Emulator Suite**.

   a. **Firebase Project**

   1. Make sure that `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` is set to `false` in `.env.local`.

   2. Optional: Set `USE_EMPTY_STATIC_PATHS` to `true` in `.env.local`. This is recommended if you're using a free Firebase plan to avoid exceeding the free quota.

   3. Create a service account key and download the generated JSON file.

   4. Update the values of `FIREBASE_ADMIN_PRIVATE_KEY` and `FIREBASE_ADMIN_CLIENT_EMAIL` in `.env.local` with the values from the JSON file.

   5. Make your storage bucket publicly readable. For more information, see [this](https://stackoverflow.com/a/61129057).

   b. **Firebase Local Emulator Suite**

   1. Make sure that `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` is set to `true` in `.env.local`.

   2. Enable the following services in your Firebase project:

      - Authentication
      - Firestore
      - Storage

   3. Update Firestore emulator variables in `.env.local` if necessary. This is only needed if you're using a different host or port.

   4. Run the following commands on your local Firebase directory to start the emulators:

      First time:

      ```sh
      firebase emulators:start --export-on-exit=./emulator-data
      ```

      Subsequent times:

      ```sh
      firebase emulators:start --import=./emulator-data --export-on-exit=./emulator-data
      ```

      This is needed to persist the data in the emulator and avoid having to reseed the database every time you restart the emulator.

5. Run this command to seed the database with sample data\*:

   ```sh
   npm run seed
   # or
   yarn seed
   ```

6. Run the development server:

   ```sh
   npm run dev
   # or
   yarn dev
   ```

7. Open [localhost:9000](http://localhost:9000) on your browser.

\* _Only canon Ys games are seeded (with some of their characters, music, and staff)._

## Contributing

1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Make your changes and ensure they're properly tested.
4. Commit your changes and push them to your forked repository.
5. Submit a pull request, explaining the changes you've made.

## License

This project is licensed under the [MIT License](https://github.com/franz-dc/beyond-ys/blob/main/LICENSE).
