process.env.NODE_ENV = "test";
process.env.ASCEND_APP_ENV = "local";
process.env.DATABASE_URL ||= "postgres://ascend_test:ascend_test@127.0.0.1:5432/ascend_test";
