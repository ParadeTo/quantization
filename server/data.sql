DROP TRIGGER "main"."generate_ts";
CREATE TRIGGER generate_ts AFTER INSERT ON k_day
  BEGIN
    UPDATE k_day SET ts = strftime('%s', NEW.date) WHERE date = NEW.date and code = NEW.code;
  END



UPDATE k_day SET ts = strftime("%s", date)